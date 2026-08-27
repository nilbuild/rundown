use crate::hn::{self, Thread};
use crate::store::{CachedOutput, LibraryHit, Store};
use crate::{fail, Fallible};
use serde::Serialize;
use tauri::State;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LibraryStats {
    entries: usize,
    stories: usize,
}

#[tauri::command]
pub(crate) fn library_search(store: State<'_, Store>, query: String) -> Fallible<Vec<LibraryHit>> {
    store.library_search(&query, 60).map_err(fail)
}

#[tauri::command]
pub(crate) fn library_stats(store: State<'_, Store>) -> Fallible<LibraryStats> {
    let (entries, stories) = store.library_size().map_err(fail)?;
    Ok(LibraryStats { entries, stories })
}

#[tauri::command]
pub(crate) fn cached_output(
    store: State<'_, Store>,
    story_id: u64,
    kind: String,
) -> Fallible<Option<CachedOutput>> {
    store.output_get(story_id, &kind).map_err(fail)
}

#[tauri::command]
pub(crate) fn cached_kinds(store: State<'_, Store>, story_id: u64) -> Fallible<Vec<String>> {
    store.output_kinds(story_id).map_err(fail)
}

/// The index fills as you read, which leaves it empty on the first run even
/// though the cache is already full. This walks what is there once.
pub(crate) fn backfill_library(store: &Store) {
    let (entries, _) = match store.library_size() {
        Ok(size) => size,
        Err(_) => return,
    };
    if entries > 0 {
        return;
    }

    let mut titles: std::collections::HashMap<u64, String> = std::collections::HashMap::new();

    for (key, raw) in store.cache_rows("thread").unwrap_or_default() {
        let id: u64 = match key.parse() {
            Ok(id) => id,
            Err(_) => continue,
        };
        let thread: Thread = match serde_json::from_str(&raw) {
            Ok(thread) => thread,
            Err(_) => continue,
        };
        titles.insert(id, thread.title.clone());

        let body = hn::flatten(&thread.comments)
            .iter()
            .map(|comment| {
                format!(
                    "{}: {}",
                    comment.author.as_deref().unwrap_or("unknown"),
                    comment.text
                )
            })
            .collect::<Vec<_>>()
            .join("\n\n");
        let _ = store.library_put(id, &thread.title, "thread", &body);
    }

    for (story_id, kind, markdown) in store.output_rows().unwrap_or_default() {
        let title = titles.get(&story_id).cloned().unwrap_or_default();
        let _ = store.library_put(story_id, &title, &kind, &markdown);
    }

    for (chat_id, body) in store.chat_rows().unwrap_or_default() {
        let story_id: u64 = match chat_id.strip_prefix("story:").and_then(|id| id.parse().ok()) {
            Some(id) => id,
            None => continue,
        };
        let title = titles.get(&story_id).cloned().unwrap_or_default();
        let _ = store.library_put(story_id, &title, "chat", &body);
    }
}
