use crate::article::{self, Article};
use crate::hn::{self, ItemRef, Story, Thread};
use crate::prompts;
use crate::store::Store;
use crate::{fail, Fallible, ARTICLE_TTL, THREAD_TTL};
use serde::Serialize;
use tauri::State;

#[tauri::command]
pub(crate) async fn feed(feed: String, offset: usize, limit: usize) -> Fallible<Vec<Story>> {
    hn::feed_page(&feed, offset, limit).await.map_err(fail)
}

#[tauri::command]
pub(crate) async fn search_stories(query: String, by_date: bool) -> Fallible<Vec<Story>> {
    hn::search(&query, by_date).await.map_err(fail)
}

pub(crate) async fn resolve_thread(store: &Store, id: u64, refresh: bool) -> anyhow::Result<Thread> {
    let key = id.to_string();
    if !refresh {
        if let Ok(Some(raw)) = store.cache_get("thread", &key, THREAD_TTL) {
            if let Ok(thread) = serde_json::from_str::<Thread>(&raw) {
                return Ok(thread);
            }
        }
    }
    let thread = hn::thread(id).await?;
    if let Ok(raw) = serde_json::to_string(&thread) {
        let _ = store.cache_put("thread", &key, &raw);
    }

    // The whole discussion, so a half-remembered comment is findable later.
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

    Ok(thread)
}

pub(crate) async fn resolve_article(store: &Store, url: &str, refresh: bool) -> anyhow::Result<Article> {
    if !refresh {
        if let Ok(Some(raw)) = store.cache_get("article", url, ARTICLE_TTL) {
            if let Ok(article) = serde_json::from_str::<Article>(&raw) {
                return Ok(article);
            }
        }
    }
    let article = article::extract(url).await?;
    if let Ok(raw) = serde_json::to_string(&article) {
        let _ = store.cache_put("article", url, &raw);
    }
    Ok(article)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ThreadView {
    thread: Thread,
    /// Comments added since this thread was last opened. `None` on a first
    /// visit, which the UI shows differently from "nothing new".
    new_comments: Option<u32>,
    /// Unix seconds of the previous visit, so individual comments posted since
    /// then can be marked in the tree.
    last_visit: Option<i64>,
}

#[tauri::command]
pub(crate) async fn load_thread(store: State<'_, Store>, id: u64, refresh: bool) -> Fallible<ThreadView> {
    let thread = resolve_thread(&store, id, refresh)
        .await
        .map_err(|err| format!("Could not load this thread: {err}"))?;
    let previous = store.visit(id, thread.comment_count).unwrap_or(None);
    let new_comments = previous.map(|(before, _)| thread.comment_count.saturating_sub(before));
    let last_visit = previous.map(|(_, read_at)| read_at);
    Ok(ThreadView {
        thread,
        new_comments,
        last_visit,
    })
}

#[tauri::command]
pub(crate) async fn load_article(store: State<'_, Store>, url: String, refresh: bool) -> Fallible<Article> {
    resolve_article(&store, &url, refresh).await.map_err(fail)
}

#[tauri::command]
pub(crate) fn read_ids(store: State<'_, Store>) -> Fallible<Vec<u64>> {
    store.read_ids().map_err(fail)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Coverage {
    included: usize,
    total: usize,
    chars: usize,
}

#[tauri::command]
pub(crate) async fn coverage(store: State<'_, Store>, story_id: u64) -> Fallible<Coverage> {
    let thread = resolve_thread(&store, story_id, false).await.map_err(fail)?;
    let article = match thread.url.as_deref() {
        Some(url) => resolve_article(&store, url, false).await.ok(),
        None => None,
    };
    let stats = prompts::pack_stats(&thread, article.as_ref());
    Ok(Coverage {
        included: stats.included,
        total: stats.total,
        chars: stats.chars,
    })
}

/// Opens whatever a pasted Hacker News link points at.
#[tauri::command]
pub(crate) async fn resolve_item(id: u64) -> Fallible<ItemRef> {
    hn::resolve_item(id)
        .await
        .map_err(|err| format!("Could not open that link: {err}"))
}
