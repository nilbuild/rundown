pub mod ai;
pub mod article;
pub mod hn;
pub mod prompts;
pub mod store;
pub mod text;
pub mod verify;

use ai::{Provider, Registry, RunSpec};
use article::Article;
use hn::{Story, Thread};
use serde::{Deserialize, Serialize};
use store::{CachedOutput, ChatMessage, Store};
use tauri::{AppHandle, Manager, State};

type Fallible<T> = Result<T, String>;

fn fail(err: impl std::fmt::Display) -> String {
    err.to_string()
}

/// A run the user stopped is not a failure and should not surface as one.
fn report_failure(app: &AppHandle, run_id: &str, err: anyhow::Error) {
    let message = err.to_string();
    if message == "cancelled" {
        return;
    }
    ai::emit_error(app, run_id, message);
}

const THREAD_TTL: i64 = 60 * 20;
const ARTICLE_TTL: i64 = 60 * 60 * 24 * 14;

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

#[tauri::command]
async fn feed(feed: String, offset: usize, limit: usize) -> Fallible<Vec<Story>> {
    hn::feed_page(&feed, offset, limit).await.map_err(fail)
}

#[tauri::command]
async fn search_stories(query: String, by_date: bool) -> Fallible<Vec<Story>> {
    hn::search(&query, by_date).await.map_err(fail)
}

async fn resolve_thread(store: &Store, id: u64, refresh: bool) -> anyhow::Result<Thread> {
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
    Ok(thread)
}

async fn resolve_article(store: &Store, url: &str, refresh: bool) -> anyhow::Result<Article> {
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
struct ThreadView {
    thread: Thread,
    /// Comments added since this thread was last opened. `None` on a first
    /// visit, which the UI shows differently from "nothing new".
    new_comments: Option<u32>,
    /// Unix seconds of the previous visit, so individual comments posted since
    /// then can be marked in the tree.
    last_visit: Option<i64>,
}

#[tauri::command]
async fn load_thread(store: State<'_, Store>, id: u64, refresh: bool) -> Fallible<ThreadView> {
    let thread = resolve_thread(&store, id, refresh).await.map_err(fail)?;
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
async fn load_article(store: State<'_, Store>, url: String, refresh: bool) -> Fallible<Article> {
    resolve_article(&store, &url, refresh).await.map_err(fail)
}

#[tauri::command]
fn read_ids(store: State<'_, Store>) -> Fallible<Vec<u64>> {
    store.read_ids().map_err(fail)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Coverage {
    included: usize,
    total: usize,
    chars: usize,
}

#[tauri::command]
async fn coverage(store: State<'_, Store>, story_id: u64) -> Fallible<Coverage> {
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

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GenerateArgs {
    run_id: String,
    kind: String,
    story_id: u64,
    provider: Provider,
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    refresh: bool,
}

#[tauri::command]
async fn generate(
    app: AppHandle,
    store: State<'_, Store>,
    registry: State<'_, Registry>,
    args: GenerateArgs,
) -> Fallible<()> {
    if let Err(err) = run_generate(&app, &store, &registry, &args).await {
        report_failure(&app, &args.run_id, err);
    }
    Ok(())
}

async fn run_generate(
    app: &AppHandle,
    store: &Store,
    registry: &State<'_, Registry>,
    args: &GenerateArgs,
) -> anyhow::Result<()> {
    let thread = resolve_thread(store, args.story_id, args.refresh).await?;
    let article = match thread.url.as_deref() {
        Some(url) => resolve_article(store, url, args.refresh).await.ok(),
        None => None,
    };

    let (system, prompt) = match args.kind.as_str() {
        "digest" => (
            prompts::digest_system(),
            prompts::digest_prompt(&thread, article.as_ref()),
        ),
        "rundown" => (
            prompts::rundown_system(),
            prompts::rundown_prompt(&thread, article.as_ref()),
        ),
        "brief" => {
            let article = article
                .as_ref()
                .filter(|a| !a.markdown.is_empty())
                .ok_or_else(|| anyhow::anyhow!("There is no readable article to brief."))?;
            (prompts::brief_system(), prompts::brief_prompt(article))
        }
        other => return Err(anyhow::anyhow!("unknown output kind: {other}")),
    };

    let spec = RunSpec {
        run_id: args.run_id.clone(),
        provider: args.provider,
        model: args.model.clone(),
        system,
        prompt,
        resume: None,
        persist: false,
    };

    let outcome = ai::run(app.clone(), registry.clone(), spec).await?;

    let report = match args.kind.as_str() {
        "digest" => Some(verify::check(&outcome.text, &thread)),
        "rundown" => Some(verify::check_references(&outcome.text, &thread)),
        _ => None,
    };

    let report_json = report
        .as_ref()
        .and_then(|report| serde_json::to_value(report).ok());
    let _ = store.output_put(
        args.story_id,
        &args.kind,
        &outcome.text,
        match args.provider {
            Provider::Claude => "claude",
            Provider::Codex => "codex",
        },
        args.model.as_deref(),
        report_json.as_ref(),
    );

    ai::emit_done(app, &outcome, &args.run_id, report);
    Ok(())
}

#[tauri::command]
fn cached_output(
    store: State<'_, Store>,
    story_id: u64,
    kind: String,
) -> Fallible<Option<CachedOutput>> {
    store.output_get(story_id, &kind).map_err(fail)
}

#[tauri::command]
fn cached_kinds(store: State<'_, Store>, story_id: u64) -> Fallible<Vec<String>> {
    store.output_kinds(story_id).map_err(fail)
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChatArgs {
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
async fn chat_send(
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

async fn run_chat(
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

    ai::emit_done(app, &outcome, &args.run_id, None);
    Ok(())
}

#[tauri::command]
fn chat_history(store: State<'_, Store>, chat_id: String) -> Fallible<Vec<ChatMessage>> {
    store.chat_history(&chat_id).map_err(fail)
}

#[tauri::command]
fn chat_clear(store: State<'_, Store>, chat_id: String) -> Fallible<()> {
    store.chat_clear(&chat_id).map_err(fail)
}

#[tauri::command]
fn cancel_run(registry: State<'_, Registry>, run_id: String) -> bool {
    registry.cancel(&run_id)
}

// ---------------------------------------------------------------------------
// Settings and environment
// ---------------------------------------------------------------------------

#[tauri::command]
fn settings_all(store: State<'_, Store>) -> Fallible<serde_json::Value> {
    store
        .settings_all()
        .map(serde_json::Value::Object)
        .map_err(fail)
}

#[tauri::command]
fn settings_set(store: State<'_, Store>, key: String, value: serde_json::Value) -> Fallible<()> {
    store.setting_set(&key, &value.to_string()).map_err(fail)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProviderStatus {
    claude: Option<String>,
    codex: Option<String>,
}

#[tauri::command]
async fn providers() -> ProviderStatus {
    let (claude, codex) = tokio::join!(ai::probe(Provider::Claude), ai::probe(Provider::Codex));
    ProviderStatus { claude, codex }
}

#[tauri::command]
fn data_location() -> String {
    store::data_dir().to_string_lossy().to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(Registry::default())
        .setup(|app| {
            let store = Store::open()?;
            app.manage(store);
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(registry) = window.try_state::<Registry>() {
                    registry.cancel_all();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            feed,
            search_stories,
            load_thread,
            load_article,
            read_ids,
            coverage,
            generate,
            cached_output,
            cached_kinds,
            chat_send,
            chat_history,
            chat_clear,
            cancel_run,
            settings_all,
            settings_set,
            providers,
            data_location,
        ])
        .run(tauri::generate_context!())
        .expect("error while running sift");
}
