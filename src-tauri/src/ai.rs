//! Drives the locally installed `claude` / `codex` CLIs as subprocesses.
//!
//! Two deliberate choices:
//! - all tools are disabled, so a run is pure inference: no file access, no
//!   permission prompts, no chance of the assistant wandering off
//! - chat turns resume the provider's own session, so the thread context is
//!   paid for once and every follow-up hits the prompt cache

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

#[derive(Default)]
pub struct Registry {
    running: Mutex<HashMap<String, Child>>,
}

impl Registry {
    fn insert(&self, run_id: &str, child: Child) {
        if let Ok(mut map) = self.running.lock() {
            map.insert(run_id.to_string(), child);
        }
    }

    fn take(&self, run_id: &str) -> Option<Child> {
        self.running.lock().ok()?.remove(run_id)
    }

    pub fn cancel(&self, run_id: &str) -> bool {
        match self.take(run_id) {
            Some(mut child) => {
                let _ = child.start_kill();
                true
            }
            None => false,
        }
    }

    pub fn cancel_all(&self) {
        let ids: Vec<String> = self
            .running
            .lock()
            .map(|map| map.keys().cloned().collect())
            .unwrap_or_default();
        for id in ids {
            self.cancel(&id);
        }
    }
}

fn workdir() -> std::path::PathBuf {
    let base = dirs::data_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("sift")
        .join("runs");
    let _ = std::fs::create_dir_all(&base);
    base
}

fn build_command(spec: &RunSpec) -> Command {
    let mut cmd = Command::new(spec.provider.binary());
    cmd.current_dir(workdir());

    match spec.provider {
        Provider::Claude => {
            cmd.arg("-p")
                .arg("--output-format")
                .arg("stream-json")
                .arg("--include-partial-messages")
                .arg("--verbose")
                // No tools: this is inference, not agency.
                .arg("--tools")
                .arg("")
                .arg("--disable-slash-commands")
                .arg("--strict-mcp-config")
                .arg("--mcp-config")
                .arg(r#"{"mcpServers":{}}"#)
                .arg("--setting-sources")
                .arg("")
                .arg("--system-prompt")
                .arg(&spec.system);

            if !spec.persist {
                cmd.arg("--no-session-persistence");
            }
            if let Some(model) = &spec.model {
                cmd.arg("--model").arg(model);
            }
            if let Some(session) = &spec.resume {
                cmd.arg("--resume").arg(session);
            }
        }
        Provider::Codex => {
            cmd.arg("exec")
                .arg("--json")
                .arg("--skip-git-repo-check")
                .arg("--sandbox")
                .arg("read-only");

            if !spec.persist {
                cmd.arg("--ephemeral");
            }
            if let Some(model) = &spec.model {
                cmd.arg("--model").arg(model);
            }
            if let Some(session) = &spec.resume {
                cmd.arg("resume").arg(session);
            }
            cmd.arg("-");
        }
    }

    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    cmd
}

/// Codex has no system-prompt flag, so the instructions are folded into the
/// message itself.
fn compose_prompt(spec: &RunSpec) -> String {
    match spec.provider {
        Provider::Claude => spec.prompt.clone(),
        Provider::Codex => format!("{}\n\n---\n\n{}", spec.system, spec.prompt),
    }
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
    let mut cmd = build_command(&spec);

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

#[allow(clippy::too_many_arguments)]
fn handle_claude_event(
    app: &AppHandle,
    spec: &RunSpec,
    event: &serde_json::Value,
    assembled: &mut String,
    session_id: &mut Option<String>,
    cost: &mut Option<f64>,
    announced: &mut bool,
    failure: &mut Option<String>,
) {
    let kind = event.get("type").and_then(|v| v.as_str()).unwrap_or("");

    if let Some(id) = event.get("session_id").and_then(|v| v.as_str()) {
        *session_id = Some(id.to_string());
    }

    match kind {
        "system" => {
            if event.get("subtype").and_then(|v| v.as_str()) == Some("init") && !*announced {
                *announced = true;
                emit(
                    app,
                    AiEvent::Started {
                        run_id: spec.run_id.clone(),
                        provider: spec.provider,
                        model: event
                            .get("model")
                            .and_then(|v| v.as_str())
                            .map(str::to_string)
                            .or_else(|| spec.model.clone()),
                        session_id: session_id.clone(),
                    },
                );
            }
        }
        "rate_limit_event" => {
            let info = event.get("rate_limit_info");
            emit(
                app,
                AiEvent::RateLimit {
                    run_id: spec.run_id.clone(),
                    status: info
                        .and_then(|v| v.get("status"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("unknown")
                        .to_string(),
                    window: info
                        .and_then(|v| v.get("rateLimitType"))
                        .and_then(|v| v.as_str())
                        .map(str::to_string),
                    resets_at: info.and_then(|v| v.get("resetsAt")).and_then(|v| v.as_i64()),
                },
            );
        }
        "stream_event" => {
            let inner = match event.get("event") {
                Some(inner) => inner,
                None => return,
            };
            if inner.get("type").and_then(|v| v.as_str()) != Some("content_block_delta") {
                return;
            }
            let delta = match inner.get("delta") {
                Some(delta) => delta,
                None => return,
            };
            if delta.get("type").and_then(|v| v.as_str()) != Some("text_delta") {
                return;
            }
            if let Some(text) = delta.get("text").and_then(|v| v.as_str()) {
                assembled.push_str(text);
                emit(
                    app,
                    AiEvent::Delta {
                        run_id: spec.run_id.clone(),
                        text: text.to_string(),
                    },
                );
            }
        }
        "result" => {
            if let Some(value) = event.get("total_cost_usd").and_then(|v| v.as_f64()) {
                *cost = Some(value);
            }
            let errored = event
                .get("is_error")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            if errored {
                *failure = Some(
                    event
                        .get("result")
                        .and_then(|v| v.as_str())
                        .unwrap_or("the model run failed")
                        .to_string(),
                );
                return;
            }
            // Deltas are the source of truth, but a run that produced none
            // still has its full text here.
            if assembled.trim().is_empty() {
                if let Some(text) = event.get("result").and_then(|v| v.as_str()) {
                    assembled.push_str(text);
                    emit(
                        app,
                        AiEvent::Delta {
                            run_id: spec.run_id.clone(),
                            text: text.to_string(),
                        },
                    );
                }
            }
        }
        _ => {}
    }
}

fn handle_codex_event(
    app: &AppHandle,
    spec: &RunSpec,
    event: &serde_json::Value,
    assembled: &mut String,
    session_id: &mut Option<String>,
    announced: &mut bool,
    failure: &mut Option<String>,
) {
    let kind = event.get("type").and_then(|v| v.as_str()).unwrap_or("");

    match kind {
        "thread.started" => {
            if let Some(id) = event.get("thread_id").and_then(|v| v.as_str()) {
                *session_id = Some(id.to_string());
            }
            if !*announced {
                *announced = true;
                emit(
                    app,
                    AiEvent::Started {
                        run_id: spec.run_id.clone(),
                        provider: spec.provider,
                        model: spec.model.clone(),
                        session_id: session_id.clone(),
                    },
                );
            }
        }
        "item.completed" => {
            let item = match event.get("item") {
                Some(item) => item,
                None => return,
            };
            match item.get("type").and_then(|v| v.as_str()) {
                Some("agent_message") => {
                    if let Some(text) = item.get("text").and_then(|v| v.as_str()) {
                        assembled.push_str(text);
                        emit(
                            app,
                            AiEvent::Delta {
                                run_id: spec.run_id.clone(),
                                text: text.to_string(),
                            },
                        );
                    }
                }
                Some("error") => {
                    let message = item
                        .get("message")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default();
                    // Codex reports config deprecations as errors; those are noise.
                    if message.contains("deprecated") || message.contains("clamping") {
                        return;
                    }
                    *failure = Some(message.to_string());
                }
                _ => {}
            }
        }
        _ => {}
    }
}

fn emit(app: &AppHandle, event: AiEvent) {
    let _ = app.emit(EVENT, event);
}

/// Check whether the provider CLIs are actually available.
pub async fn probe(provider: Provider) -> Option<String> {
    let output = Command::new(provider.binary())
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
