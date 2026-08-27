use crate::ai::{self, Provider, Registry, RunSpec};
use crate::commands::reading::{resolve_article, resolve_thread};
use crate::prompts;
use crate::store::{Store, Synthesis};
use crate::{fail, report_failure, Fallible};
use serde::Deserialize;
use tauri::{AppHandle, State};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SynthesiseArgs {
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
pub(crate) async fn synthesise(
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

pub(crate) async fn run_synthesis(
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
pub(crate) fn synthesis_list(store: State<'_, Store>) -> Fallible<Vec<Synthesis>> {
    store.synthesis_list().map_err(fail)
}

#[tauri::command]
pub(crate) fn synthesis_delete(store: State<'_, Store>, id: i64) -> Fallible<()> {
    store.synthesis_delete(id).map_err(fail)
}
