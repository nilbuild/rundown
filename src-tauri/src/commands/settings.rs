use crate::ai::{self, Provider};
use crate::store::{self, Store};
use crate::{fail, Fallible};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;

#[tauri::command]
pub(crate) fn settings_all(store: State<'_, Store>) -> Fallible<serde_json::Value> {
    store
        .settings_all()
        .map(serde_json::Value::Object)
        .map_err(fail)
}

#[tauri::command]
pub(crate) fn settings_set(store: State<'_, Store>, key: String, value: serde_json::Value) -> Fallible<()> {
    store.setting_set(&key, &value.to_string()).map_err(fail)
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ModelOption {
    value: String,
    label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    hint: Option<String>,
}

pub(crate) fn option(value: &str, label: &str, hint: Option<&str>) -> ModelOption {
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
pub(crate) fn available_models(provider: Provider) -> Vec<ModelOption> {
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
pub(crate) async fn resolve_models(
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

pub(crate) const RESOLVED_KEY: &str = "resolved_models";

#[derive(Serialize, Deserialize)]
pub(crate) struct Resolved {
    version: String,
    models: HashMap<String, String>,
}

pub(crate) fn codex_models() -> Option<Vec<ModelOption>> {
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
pub(crate) struct ProviderStatus {
    claude: Option<String>,
    codex: Option<String>,
}

#[tauri::command]
pub(crate) async fn providers() -> ProviderStatus {
    let (claude, codex) = tokio::join!(ai::probe(Provider::Claude), ai::probe(Provider::Codex));
    ProviderStatus { claude, codex }
}

#[tauri::command]
pub(crate) fn data_location() -> String {
    store::data_dir().to_string_lossy().to_string()
}
