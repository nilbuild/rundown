//! Works out where the reader's CLIs actually live.
//!
//! A GUI app is started by launchd, not by a shell, so it inherits
//! `/usr/bin:/bin:/usr/sbin:/sbin` and nothing else. Every way of installing
//! `claude` or `codex` puts them somewhere else — `~/.local/bin`, Homebrew, a
//! node version manager — so an app launched from the Dock cannot find a CLI
//! that works perfectly well in a terminal. Running one from `cargo tauri dev`
//! hides this completely, because then the shell's environment is inherited.

use std::time::Duration;
use tokio::process::Command;
use tokio::sync::OnceCell;

static SEARCH_PATH: OnceCell<String> = OnceCell::const_new();

/// The PATH to give every CLI subprocess. Setting it on the child covers more
/// than finding the binary: `claude` is a script that goes looking for `node`,
/// and that has to resolve too.
///
/// Worked out once. Asking the shell costs a few hundred milliseconds, so the
/// app starts this during setup — but callers still await it, because the very
/// first thing the reader's window does is ask whether a CLI is installed, and
/// answering that before the search path exists would say no.
pub async fn search_path() -> &'static str {
    SEARCH_PATH.get_or_init(resolve).await
}

async fn resolve() -> String {
    let mut dirs: Vec<String> = Vec::new();

    if let Some(from_shell) = login_shell_path().await {
        push_all(&mut dirs, &from_shell);
    }
    if let Ok(inherited) = std::env::var("PATH") {
        push_all(&mut dirs, &inherited);
    }
    for candidate in fallbacks() {
        push(&mut dirs, candidate);
    }

    dirs.join(":")
}

/// Warms the cache so the first run does not pay for the shell probe.
pub async fn warm() {
    search_path().await;
}

/// Asks the reader's login shell what it thinks PATH is. `-i` matters: most
/// people set PATH in `.zshrc`, which a non-interactive shell never reads. The
/// markers are there because an interactive shell also prints whatever else
/// the reader's profile has to say.
async fn login_shell_path() -> Option<String> {
    let shell = std::env::var("SHELL").ok()?;
    let script = r#"printf '\036%s\036' "$PATH""#;
    let output = Command::new(shell)
        .args(["-ilc", script])
        // A profile that draws a prompt or paginates would otherwise sit there
        // waiting for a terminal that does not exist.
        .env("TERM", "dumb")
        .env("PAGER", "cat")
        .stdin(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .output();

    // A profile that blocks must not take the app down with it.
    let output = tokio::time::timeout(Duration::from_secs(5), output)
        .await
        .ok()?
        .ok()?;

    let text = String::from_utf8_lossy(&output.stdout);
    let found = text.split('\u{1e}').nth(1)?.trim().to_string();
    (!found.is_empty()).then_some(found)
}

/// Where the two CLIs land when the shell cannot be asked. Ordered the way a
/// shell would search them.
fn fallbacks() -> Vec<String> {
    let mut dirs = vec![
        "/opt/homebrew/bin".to_string(),
        "/usr/local/bin".to_string(),
        "/usr/bin".to_string(),
        "/bin".to_string(),
    ];
    if let Some(home) = std::env::var_os("HOME") {
        let home = std::path::Path::new(&home);
        for suffix in [".local/bin", ".bun/bin", ".cargo/bin", ".npm-global/bin", ".volta/bin"] {
            dirs.push(home.join(suffix).to_string_lossy().into_owned());
        }
    }
    dirs
}

fn push_all(dirs: &mut Vec<String>, value: &str) {
    for entry in value.split(':') {
        push(dirs, entry.to_string());
    }
}

fn push(dirs: &mut Vec<String>, entry: String) {
    if entry.is_empty() || dirs.contains(&entry) {
        return;
    }
    dirs.push(entry);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_the_first_of_each_duplicate() {
        let mut dirs = Vec::new();
        push_all(&mut dirs, "/a:/b:/a");
        push_all(&mut dirs, "/b:/c");
        assert_eq!(dirs, vec!["/a", "/b", "/c"]);
    }

    #[test]
    fn skips_empty_entries() {
        let mut dirs = Vec::new();
        push_all(&mut dirs, "/a::/b:");
        assert_eq!(dirs, vec!["/a", "/b"]);
    }

    #[test]
    fn fallbacks_cover_where_the_clis_install() {
        let dirs = fallbacks();
        assert!(dirs.iter().any(|d| d.ends_with(".local/bin")));
        assert!(dirs.iter().any(|d| d == "/opt/homebrew/bin"));
    }
}
