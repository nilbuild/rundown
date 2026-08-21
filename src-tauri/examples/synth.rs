//! Build a real cross-thread synthesis from the local library and run it.
//! cargo run --release --example synth -- <model> <story_id> <story_id> ...

use sift_lib::{hn, prompts, store::Store};
use std::io::Write;
use std::process::{Command, Stdio};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let mut args = std::env::args().skip(1);
    let model = args.next().unwrap_or_else(|| "sonnet".into());
    let ids: Vec<u64> = args.filter_map(|a| a.parse().ok()).collect();
    if ids.len() < 2 {
        eprintln!("need at least two story ids");
        return Ok(());
    }

    let store = Store::open()?;
    let per_story = (260_000 / ids.len()).max(20_000);
    let mut sources = Vec::new();

    for id in &ids {
        let thread = hn::thread(*id).await?;
        let body = match store.output_get(*id, "rundown") {
            Ok(Some(cached)) if !cached.markdown.trim().is_empty() => {
                eprintln!("  {} — using existing briefing", thread.title);
                cached.markdown
            }
            _ => {
                eprintln!("  {} — packing {} comments", thread.title, thread.comment_count);
                prompts::pack(&thread, None, per_story)
            }
        };
        sources.push(prompts::Source {
            story_id: *id,
            title: thread.title.clone(),
            url: thread.url.clone(),
            body,
        });
    }

    let system = prompts::synthesis_system();
    let prompt = prompts::synthesis_prompt(&sources, "");
    eprintln!("prompt is {} chars (~{}k tokens)", prompt.len(), prompt.len() / 4000);
    eprintln!("running claude ({model})…");

    let started = std::time::Instant::now();
    let mut child = Command::new("claude")
        .args([
            "-p", "--output-format", "text", "--tools", "", "--disable-slash-commands",
            "--strict-mcp-config", "--mcp-config", r#"{"mcpServers":{}}"#,
            "--setting-sources", "", "--no-session-persistence",
            "--model", &model, "--system-prompt", &system,
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()?;
    child.stdin.as_mut().unwrap().write_all(prompt.as_bytes())?;
    let out = child.wait_with_output()?;
    eprintln!("  done in {:.1}s", started.elapsed().as_secs_f32());
    println!("{}", String::from_utf8_lossy(&out.stdout));
    Ok(())
}
