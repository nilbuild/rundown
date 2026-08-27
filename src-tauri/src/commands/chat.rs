use crate::ai::{self, Provider, Registry, RunSpec};
use crate::commands::reading::{resolve_article, resolve_thread};
use crate::{prompts, text};
use crate::store::{ChatMessage, Store};
use crate::{fail, report_failure, Fallible};
use serde::Deserialize;
use tauri::{AppHandle, State};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ChatArgs {
    run_id: String,
    chat_id: String,
    story_id: u64,
    provider: Provider,
    #[serde(default)]
    model: Option<String>,
    message: String,
    /// Text the reader highlighted before asking.
    #[serde(default)]
    selection: Option<String>,
    /// Where the selection came from, for framing: "article" | "comment" | "digest"
    #[serde(default)]
    selection_source: Option<String>,
}

#[tauri::command]
pub(crate) async fn chat_send(
    app: AppHandle,
    store: State<'_, Store>,
    registry: State<'_, Registry>,
    args: ChatArgs,
) -> Fallible<()> {
    if let Err(err) = run_chat(&app, &store, &registry, &args).await {
        report_failure(&app, &args.run_id, err);
    }
    Ok(())
}

pub(crate) async fn run_chat(
    app: &AppHandle,
    store: &Store,
    registry: &State<'_, Registry>,
    args: &ChatArgs,
) -> anyhow::Result<()> {
    let existing = store.chat_session(&args.chat_id).ok().flatten();

    // The full thread is only sent on the first turn. After that the provider
    // session already holds it, and follow-ups hit the prompt cache.
    let system = match &existing {
        Some(_) => prompts::selection_system(),
        None => {
            let thread = resolve_thread(store, args.story_id, false).await?;
            let article = match thread.url.as_deref() {
                Some(url) => resolve_article(store, url, false).await.ok(),
                None => None,
            };
            prompts::chat_system(&thread, article.as_ref())
        }
    };

    let prompt = match (&args.selection, &args.selection_source) {
        (Some(selection), source) if !selection.trim().is_empty() => {
            let origin = source.as_deref().unwrap_or("the page");
            format!(
                "The reader highlighted this from {origin}:\n\n<highlight>\n{}\n</highlight>\n\n{}",
                text::truncate_chars(selection.trim(), 12_000),
                args.message.trim()
            )
        }
        _ => args.message.trim().to_string(),
    };

    let display = match &args.selection {
        Some(selection) if !selection.trim().is_empty() => {
            format!("> {}\n\n{}", selection.trim(), args.message.trim())
        }
        _ => args.message.trim().to_string(),
    };
    let _ = store.chat_append(&args.chat_id, "user", &display);

    let spec = RunSpec {
        run_id: args.run_id.clone(),
        provider: args.provider,
        model: args.model.clone(),
        system,
        prompt,
        resume: existing,
        persist: true,
    };

    let outcome = ai::run(app.clone(), registry.clone(), spec).await?;

    if let Some(session_id) = &outcome.session_id {
        let _ = store.chat_set_session(&args.chat_id, args.story_id, session_id);
    }
    let _ = store.chat_append(&args.chat_id, "assistant", &outcome.text);

    if let Ok(history) = store.chat_history(&args.chat_id) {
        let body = history
            .iter()
            .map(|message| format!("{}: {}", message.role, message.content))
            .collect::<Vec<_>>()
            .join("\n\n");
        let title = resolve_thread(store, args.story_id, false)
            .await
            .map(|thread| thread.title)
            .unwrap_or_default();
        let _ = store.library_put(args.story_id, &title, "chat", &body);
    }

    ai::emit_done(app, &outcome, &args.run_id, None);
    Ok(())
}

#[tauri::command]
pub(crate) fn chat_history(store: State<'_, Store>, chat_id: String) -> Fallible<Vec<ChatMessage>> {
    store.chat_history(&chat_id).map_err(fail)
}

#[tauri::command]
pub(crate) fn chat_clear(store: State<'_, Store>, chat_id: String) -> Fallible<()> {
    store.chat_clear(&chat_id).map_err(fail)
}

#[tauri::command]
pub(crate) fn cancel_run(registry: State<'_, Registry>, run_id: String) -> bool {
    registry.cancel(&run_id)
}
