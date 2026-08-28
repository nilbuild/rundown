use super::*;

/// Hangs off `store::data_dir` rather than rebuilding the path, so this can
/// never create the data directory ahead of the Sift migration and leave it
/// deciding there was nothing to carry over.
pub(super) fn workdir() -> std::path::PathBuf {
    let base = crate::store::data_dir().join("runs");
    let _ = std::fs::create_dir_all(&base);
    base
}

pub(super) async fn build_command(spec: &RunSpec) -> Command {
    let mut cmd = Command::new(spec.provider.binary());
    // Launched from the Dock there is no shell PATH to inherit, so the app
    // supplies one it worked out itself.
    cmd.env("PATH", super::path::search_path().await);
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
pub(super) fn compose_prompt(spec: &RunSpec) -> String {
    match spec.provider {
        Provider::Claude => spec.prompt.clone(),
        Provider::Codex => format!("{}\n\n---\n\n{}", spec.system, spec.prompt),
    }
}
