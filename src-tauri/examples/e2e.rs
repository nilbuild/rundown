//! End-to-end check of the part that has to be right: fetch a real thread,
//! pack it, digest it with the local `claude` CLI, then verify every quote
//! against the source comments.
//!
//! cargo run --example e2e -- <story_id> [model]

use rundown_lib::{article, hn, prompts, verify};
use std::io::Write;
use std::process::{Command, Stdio};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let mut args = std::env::args().skip(1);
    let story_id: u64 = args.next().unwrap_or_else(|| "49273478".into()).parse()?;
    let model = args.next().unwrap_or_else(|| "sonnet".into());
    let provider = std::env::var("RUNDOWN_PROVIDER").unwrap_or_else(|_| "claude".into());
    // Re-check an already-generated digest instead of paying for a new one.
    let replay = args.next();

    eprintln!("fetching thread {story_id}…");
    let thread = hn::thread(story_id).await?;
    eprintln!("  {} — {} comments", thread.title, thread.comment_count);

    let article = match thread.url.as_deref() {
        Some(url) => {
            eprintln!("extracting {url}…");
            match article::extract(url).await {
                Ok(found) => {
                    if let Some(note) = &found.note {
                        eprintln!("  not readable: {note}");
                    } else {
                        eprintln!("  {} words", found.word_count);
                    }
                    Some(found)
                }
                Err(err) => {
                    eprintln!("  failed: {err}");
                    None
                }
            }
        }
        None => None,
    };

    let stats = prompts::pack_stats(&thread, article.as_ref());
    eprintln!(
        "packed {}/{} comments, {} chars (~{}k tokens)",
        stats.included,
        stats.total,
        stats.chars,
        stats.chars / 4000
    );

    if let Some(path) = replay {
        let digest = std::fs::read_to_string(&path)?;
        eprintln!("re-checking {path}");
        report(&digest, &thread);
        return Ok(());
    }

    let system = prompts::digest_system();
    let prompt = prompts::digest_prompt(&thread, article.as_ref());

    eprintln!("running {provider} ({model})…");
    let started = std::time::Instant::now();

    let mut child = if provider == "codex" {
        // Codex has no system-prompt flag, so it is folded into the message —
        // the same thing ai.rs does.
        let mut c = Command::new("codex");
        c.args(["exec", "--json", "--skip-git-repo-check", "--sandbox", "read-only", "--ephemeral"]);
        if model != "default" {
            c.args(["--model", &model]);
        }
        c.arg("-")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()?
    } else {
        Command::new("claude")
        .args([
            "-p",
            "--output-format",
            "text",
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
            &model,
            "--system-prompt",
            &system,
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()?
    };

    let payload = if provider == "codex" {
        format!("{system}\n\n---\n\n{prompt}")
    } else {
        prompt.clone()
    };
    child.stdin.as_mut().expect("stdin").write_all(payload.as_bytes())?;

    let output = child.wait_with_output()?;
    let raw = String::from_utf8_lossy(&output.stdout).to_string();
    let digest = if provider == "codex" {
        raw.lines()
            .filter_map(|l| serde_json::from_str::<serde_json::Value>(l).ok())
            .filter(|v| v["type"] == "item.completed" && v["item"]["type"] == "agent_message")
            .filter_map(|v| v["item"]["text"].as_str().map(str::to_string))
            .collect::<Vec<_>>()
            .join("\n")
    } else {
        raw
    };
    eprintln!("  done in {:.1}s\n", started.elapsed().as_secs_f32());

    println!("{digest}");
    report(&digest, &thread);
    Ok(())
}

fn report(digest: &str, thread: &hn::Thread) {
    let report = verify::check(digest, thread);
    eprintln!("\n──────── citation check ────────");
    eprintln!(
        "{} citations · {} exact · {} loose · {} problems",
        report.citations.len(),
        report.exact,
        report.loose,
        report.problems
    );
    for citation in &report.citations {
        let mark = match citation.status {
            verify::Status::Exact => "ok  ",
            verify::Status::Loose => "~   ",
            _ => "FAIL",
        };
        let snippet: String = citation.quote.chars().take(72).collect();
        eprintln!(
            "{mark} [{}] @{} — {snippet}",
            citation.comment_id, citation.claimed_author
        );
    }

    if report.citations.is_empty() {
        eprintln!("\nWARNING: the model produced no parseable citations at all.");
    }
}
