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
use std::collections::HashMap;
use store::{CachedOutput, ChatMessage, HistoryEntry, LibraryHit, Store, Synthesis};
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
    let _ = store.library_put(args.story_id, &thread.title, &args.kind, &outcome.text);

    ai::emit_done(app, &outcome, &args.run_id, report);
    Ok(())
}

#[tauri::command]
fn reading_history(store: State<'_, Store>) -> Fallible<Vec<HistoryEntry>> {
    store.reading_history(200).map_err(fail)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SynthesiseArgs {
    run_id: String,
    story_ids: Vec<u64>,
    provider: Provider,
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    instruction: String,
    #[serde(default)]
    title: String,
}

#[tauri::command]
async fn synthesise(
    app: AppHandle,
    store: State<'_, Store>,
    registry: State<'_, Registry>,
    args: SynthesiseArgs,
) -> Fallible<()> {
    if let Err(err) = run_synthesis(&app, &store, &registry, &args).await {
        report_failure(&app, &args.run_id, err);
    }
    Ok(())
}

async fn run_synthesis(
    app: &AppHandle,
    store: &Store,
    registry: &State<'_, Registry>,
    args: &SynthesiseArgs,
) -> anyhow::Result<()> {
    if args.story_ids.len() < 2 {
        return Err(anyhow::anyhow!("Pick at least two stories to compare."));
    }

    // Each story gets an equal share, so adding a fifth thread narrows them all
    // rather than silently dropping the last one.
    let per_story = (260_000 / args.story_ids.len()).max(20_000);
    let mut sources = Vec::new();

    for id in &args.story_ids {
        let thread = resolve_thread(store, *id, false).await?;
        let article = match thread.url.as_deref() {
            Some(url) => resolve_article(store, url, false).await.ok(),
            None => None,
        };

        // A briefing already distilled this thread. Re-reading the raw comments
        // would spend the budget to reach a worse version of the same thing.
        let body = match store.output_get(*id, "rundown") {
            Ok(Some(cached)) if !cached.markdown.trim().is_empty() => cached.markdown,
            _ => prompts::pack(&thread, article.as_ref(), per_story),
        };

        sources.push(prompts::Source {
            story_id: *id,
            title: thread.title.clone(),
            url: thread.url.clone(),
            body,
        });
    }

    let spec = RunSpec {
        run_id: args.run_id.clone(),
        provider: args.provider,
        model: args.model.clone(),
        system: prompts::synthesis_system(),
        prompt: prompts::synthesis_prompt(&sources, &args.instruction),
        resume: None,
        persist: false,
    };

    let outcome = ai::run(app.clone(), registry.clone(), spec).await?;

    let title = if args.title.trim().is_empty() {
        sources
            .iter()
            .map(|source| source.title.as_str())
            .collect::<Vec<_>>()
            .join(" · ")
    } else {
        args.title.trim().to_string()
    };
    let _ = store.synthesis_put(&title, &args.story_ids, &outcome.text);

    ai::emit_done(app, &outcome, &args.run_id, None);
    Ok(())
}

#[tauri::command]
fn synthesis_list(store: State<'_, Store>) -> Fallible<Vec<Synthesis>> {
    store.synthesis_list().map_err(fail)
}

#[tauri::command]
fn synthesis_delete(store: State<'_, Store>, id: i64) -> Fallible<()> {
    store.synthesis_delete(id).map_err(fail)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LibraryStats {
    entries: usize,
    stories: usize,
}

#[tauri::command]
fn library_search(store: State<'_, Store>, query: String) -> Fallible<Vec<LibraryHit>> {
    store.library_search(&query, 60).map_err(fail)
}

#[tauri::command]
fn library_stats(store: State<'_, Store>) -> Fallible<LibraryStats> {
    let (entries, stories) = store.library_size().map_err(fail)?;
    Ok(LibraryStats { entries, stories })
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

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ModelOption {
    value: String,
    label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    hint: Option<String>,
}

fn option(value: &str, label: &str, hint: Option<&str>) -> ModelOption {
    ModelOption {
        value: value.to_string(),
        label: label.to_string(),
        hint: hint.map(str::to_string),
    }
}

/// Codex keeps the list it fetched from the server, so it is authoritative and
/// current. Claude has no equivalent — `/v1/models` needs credentials this app
/// deliberately does not hold, and returns releases rather than the aliases the
/// CLI takes — so its aliases stay written down, which is what `--model`
/// documents anyway. They are pointers at the latest model in each tier, so a
/// new release does not date them; only a new tier would, and the Custom row in
/// the picker covers that without a new build.
#[tauri::command]
fn available_models(provider: Provider) -> Vec<ModelOption> {
    match provider {
        Provider::Claude => vec![
            option("", "Default", Some("Whatever the CLI is set to")),
            option("haiku", "Haiku", Some("Fastest")),
            option("sonnet", "Sonnet", Some("Balanced")),
            option("opus", "Opus", Some("Deepest")),
            option("fable", "Fable", None),
        ],
        Provider::Codex => {
            let mut out = vec![option(
                "",
                "Default",
                Some("Whatever ~/.codex/config.toml selects"),
            )];
            out.extend(codex_models().unwrap_or_default());
            out
        }
    }
}

/// What each Claude alias currently points at, so the picker can say what a run
/// will actually use rather than only what it is called.
///
/// Keyed on the CLI's own version: aliases only move when a new Claude Code
/// ships, so a cached answer stays right until the reader updates, and the
/// probe is paid for once per update rather than once per glance. Codex is
/// absent by design — its options are concrete slugs already, so there is
/// nothing to resolve.
#[tauri::command]
async fn resolve_models(
    store: State<'_, Store>,
    provider: Provider,
) -> Fallible<HashMap<String, String>> {
    if provider != Provider::Claude {
        return Ok(HashMap::new());
    }

    let version = match ai::probe(Provider::Claude).await {
        Some(version) => version,
        None => return Ok(HashMap::new()),
    };

    if let Ok(Some(raw)) = store.setting_get(RESOLVED_KEY) {
        if let Ok(cached) = serde_json::from_str::<Resolved>(&raw) {
            if cached.version == version {
                return Ok(cached.models);
            }
        }
    }

    let aliases = ["haiku", "sonnet", "opus", "fable"];
    let found = futures::future::join_all(aliases.iter().map(|alias| async move {
        (alias.to_string(), ai::resolve_alias(alias).await)
    }))
    .await;

    let models: HashMap<String, String> = found
        .into_iter()
        .filter_map(|(alias, model)| model.map(|model| (alias, model)))
        .collect();

    // A run that failed or timed out would otherwise be cached as "this alias
    // has no model" until the next CLI update.
    if models.len() == aliases.len() {
        let record = Resolved {
            version,
            models: models.clone(),
        };
        if let Ok(raw) = serde_json::to_string(&record) {
            let _ = store.setting_set(RESOLVED_KEY, &raw);
        }
    }

    Ok(models)
}

const RESOLVED_KEY: &str = "resolved_models";

#[derive(Serialize, Deserialize)]
struct Resolved {
    version: String,
    models: HashMap<String, String>,
}

fn codex_models() -> Option<Vec<ModelOption>> {
    #[derive(Deserialize)]
    struct Cache {
        models: Vec<Entry>,
    }
    #[derive(Deserialize)]
    struct Entry {
        slug: String,
        #[serde(default)]
        display_name: Option<String>,
        #[serde(default)]
        description: Option<String>,
    }

    let path = dirs::home_dir()?.join(".codex").join("models_cache.json");
    let raw = std::fs::read_to_string(path).ok()?;
    let cache: Cache = serde_json::from_str(&raw).ok()?;

    Some(
        cache
            .models
            .into_iter()
            .map(|entry| ModelOption {
                label: entry.display_name.unwrap_or_else(|| entry.slug.clone()),
                value: entry.slug,
                hint: entry.description,
            })
            .collect(),
    )
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

/// The index fills as you read, which leaves it empty on the first run even
/// though the cache is already full. This walks what is there once.
fn backfill_library(store: &Store) {
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(Registry::default())
        .setup(|app| {
            let store = Store::open()?;
            backfill_library(&store);
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
            library_search,
            library_stats,
            reading_history,
            synthesise,
            synthesis_list,
            synthesis_delete,
            chat_send,
            chat_history,
            chat_clear,
            cancel_run,
            settings_all,
            settings_set,
            providers,
            available_models,
            resolve_models,
            data_location,
        ])
        .run(tauri::generate_context!())
        .expect("error while running sift");
}
