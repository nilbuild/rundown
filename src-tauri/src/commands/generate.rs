use crate::ai::{self, Provider, Registry, RunSpec};
use crate::commands::reading::{resolve_article, resolve_thread};
use crate::prompts;
use crate::store::{HistoryEntry, Store};
use crate::verify;
use crate::{fail, report_failure, Fallible};
use serde::Deserialize;
use tauri::{AppHandle, State};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GenerateArgs {
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
pub(crate) async fn generate(
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

pub(crate) async fn run_generate(
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
pub(crate) fn reading_history(store: State<'_, Store>) -> Fallible<Vec<HistoryEntry>> {
    store.reading_history(200).map_err(fail)
}
