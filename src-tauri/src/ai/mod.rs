//! Drives the locally installed `claude` / `codex` CLIs as subprocesses.
//!
//! Two deliberate choices:
//! - all tools are disabled, so a run is pure inference: no file access, no
//!   permission prompts, no chance of the assistant wandering off
//! - chat turns resume the provider's own session, so the thread context is
//!   paid for once and every follow-up hits the prompt cache

mod claude;
mod codex;
mod command;
mod path;
mod registry;

pub use path::warm as warm_search_path;
pub use registry::Registry;

use claude::handle_claude_event;
use codex::handle_codex_event;
use command::{build_command, compose_prompt, workdir};

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};

pub const EVENT: &str = "ai://event";

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Claude,
    Codex,
}

impl Provider {
    fn binary(&self) -> &'static str {
        match self {
            Provider::Claude => "claude",
            Provider::Codex => "codex",
        }
    }
}

#[derive(Deserialize, Clone, Debug)]
pub struct RunSpec {
    pub run_id: String,
    pub provider: Provider,
    #[serde(default)]
    pub model: Option<String>,
    pub system: String,
    pub prompt: String,
    /// Resume a previous provider session so earlier context stays cached.
    #[serde(default)]
    pub resume: Option<String>,
    /// One-shot runs do not persist, so they stay out of the user's own
    /// `claude --resume` history. Chat turns must persist to be resumable.
    #[serde(default)]
    pub persist: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AiEvent {
    #[serde(rename_all = "camelCase")]
    Started {
        run_id: String,
        provider: Provider,
        model: Option<String>,
        session_id: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    Delta { run_id: String, text: String },
    #[serde(rename_all = "camelCase")]
    RateLimit {
        run_id: String,
        status: String,
        window: Option<String>,
        resets_at: Option<i64>,
    },
    #[serde(rename_all = "camelCase")]
    Done {
        run_id: String,
        text: String,
        session_id: Option<String>,
        duration_ms: u64,
        cost_usd: Option<f64>,
        /// Citation check, present for outputs that quote the thread.
        report: Option<crate::verify::Report>,
    },
    #[serde(rename_all = "camelCase")]
    Error { run_id: String, message: String },
}

#[derive(Clone, Debug)]
pub struct RunOutcome {
    pub text: String,
    pub session_id: Option<String>,
    pub duration_ms: u64,
    pub cost_usd: Option<f64>,
}

/// Emits `Started` / `Delta` / `RateLimit` as they arrive and returns the
/// assembled result. The caller emits the terminal event, so it can attach a
/// citation report to it.
pub async fn run(
    app: AppHandle,
    registry: tauri::State<'_, Registry>,
    spec: RunSpec,
) -> Result<RunOutcome> {
    let started = std::time::Instant::now();
    let mut cmd = build_command(&spec).await;

    let mut child = cmd.spawn().map_err(|err| {
        anyhow!(
            "could not start `{}`: {err}. Is it installed and on PATH?",
            spec.provider.binary()
        )
    })?;

    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| anyhow!("no stdin on child process"))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| anyhow!("no stdout on child process"))?;
    let stderr = child.stderr.take();

    let payload = compose_prompt(&spec);
    tokio::spawn(async move {
        let _ = stdin.write_all(payload.as_bytes()).await;
        let _ = stdin.shutdown().await;
    });

    let stderr_buffer = std::sync::Arc::new(Mutex::new(String::new()));
    if let Some(stderr) = stderr {
        let sink = stderr_buffer.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if let Ok(mut buffer) = sink.lock() {
                    buffer.push_str(&line);
                    buffer.push('\n');
                }
            }
        });
    }

    registry.insert(&spec.run_id, child);

    let mut reader = BufReader::new(stdout).lines();
    let mut assembled = String::new();
    let mut session_id: Option<String> = None;
    let mut cost: Option<f64> = None;
    let mut announced = false;
    let mut failure: Option<String> = None;

    while let Ok(Some(line)) = reader.next_line().await {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let event: serde_json::Value = match serde_json::from_str(line) {
            Ok(value) => value,
            Err(_) => continue,
        };

        match spec.provider {
            Provider::Claude => handle_claude_event(
                &app,
                &spec,
                &event,
                &mut assembled,
                &mut session_id,
                &mut cost,
                &mut announced,
                &mut failure,
            ),
            Provider::Codex => handle_codex_event(
                &app,
                &spec,
                &event,
                &mut assembled,
                &mut session_id,
                &mut announced,
                &mut failure,
            ),
        }
    }

    let mut child = registry
        .take(&spec.run_id)
        .ok_or_else(|| anyhow!("cancelled"))?;
    let status = child.wait().await?;

    if let Some(message) = failure {
        return Err(anyhow!(message));
    }

    if !status.success() && assembled.trim().is_empty() {
        let detail = stderr_buffer
            .lock()
            .map(|buffer| buffer.trim().to_string())
            .unwrap_or_default();
        return Err(if detail.is_empty() {
            anyhow!("{} exited with {status}", spec.provider.binary())
        } else {
            anyhow!(detail.chars().take(600).collect::<String>())
        });
    }

    Ok(RunOutcome {
        text: assembled,
        session_id,
        duration_ms: started.elapsed().as_millis() as u64,
        cost_usd: cost,
    })
}

pub fn emit_done(app: &AppHandle, outcome: &RunOutcome, run_id: &str, report: Option<crate::verify::Report>) {
    emit(
        app,
        AiEvent::Done {
            run_id: run_id.to_string(),
            text: outcome.text.clone(),
            session_id: outcome.session_id.clone(),
            duration_ms: outcome.duration_ms,
            cost_usd: outcome.cost_usd,
            report,
        },
    );
}

pub fn emit_error(app: &AppHandle, run_id: &str, message: impl Into<String>) {
    emit(
        app,
        AiEvent::Error {
            run_id: run_id.to_string(),
            message: message.into(),
        },
    );
}

fn emit(app: &AppHandle, event: AiEvent) {
    let _ = app.emit(EVENT, event);
}

/// Check whether the provider CLIs are actually available.
pub async fn probe(provider: Provider) -> Option<String> {
    let output = Command::new(provider.binary())
        .env("PATH", path::search_path().await)
        .arg("--version")
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .await
        .ok()?;
    if !output.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// Asks the CLI what an alias currently resolves to.
///
/// `opus` is a pointer at the latest model in its tier, which is what stops the
/// picker going stale — but it also means the picker cannot say what you are
/// about to run. A stream-json session names its model in the `init` line it
/// prints during startup, before any request is made, so the child is killed
/// the moment that line arrives: nothing is generated and no allowance is
/// spent. Settings are left out so this never triggers the reader's own
/// SessionStart hooks.
pub async fn resolve_alias(alias: &str) -> Option<String> {
    let mut child = Command::new(Provider::Claude.binary())
        .args([
            "-p",
            "hi",
            "--output-format",
            "stream-json",
            "--verbose",
            "--tools",
            "",
            "--disable-slash-commands",
            "--strict-mcp-config",
            "--mcp-config",
            r#"{"mcpServers":{}}"#,
            "--setting-sources",
            "",
            "--no-session-persistence",
            "--model",
            alias,
        ])
        .current_dir(workdir())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .ok()?;

    let stdout = child.stdout.take()?;
    let mut lines = BufReader::new(stdout).lines();

    let found = tokio::time::timeout(std::time::Duration::from_secs(30), async {
        while let Ok(Some(line)) = lines.next_line().await {
            let event: serde_json::Value = match serde_json::from_str(&line) {
                Ok(event) => event,
                Err(_) => continue,
            };
            if event["subtype"] != "init" {
                continue;
            }
            return event["model"].as_str().map(str::to_string);
        }
        None
    })
    .await
    .ok()
    .flatten();

    let _ = child.kill().await;
    found
}
