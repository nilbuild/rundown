pub mod ai;
pub mod article;
pub mod hn;
pub mod prompts;
pub mod store;
pub mod text;
pub mod commands;
pub mod verify;

use ai::Registry;
use store::Store;
use tauri::{AppHandle, Manager};

pub(crate) type Fallible<T> = Result<T, String>;

pub(crate) fn fail(err: impl std::fmt::Display) -> String {
    err.to_string()
}

/// A run the user stopped is not a failure and should not surface as one.
pub(crate) fn report_failure(app: &AppHandle, run_id: &str, err: anyhow::Error) {
    let message = err.to_string();
    if message == "cancelled" {
        return;
    }
    ai::emit_error(app, run_id, message);
}

pub(crate) const THREAD_TTL: i64 = 60 * 20;
pub(crate) const ARTICLE_TTL: i64 = 60 * 60 * 24 * 14;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(Registry::default())
        .setup(|app| {
            let store = Store::open()?;
            commands::library::backfill_library(&store);
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
            commands::reading::feed,
            commands::reading::search_stories,
            commands::reading::load_thread,
            commands::reading::load_article,
            commands::reading::read_ids,
            commands::reading::coverage,
            commands::reading::resolve_item,
            commands::generate::generate,
            commands::library::cached_output,
            commands::library::cached_kinds,
            commands::library::library_search,
            commands::library::library_stats,
            commands::generate::reading_history,
            commands::synthesis::synthesise,
            commands::synthesis::synthesis_list,
            commands::synthesis::synthesis_delete,
            commands::chat::chat_send,
            commands::chat::chat_history,
            commands::chat::chat_clear,
            commands::chat::cancel_run,
            commands::settings::settings_all,
            commands::settings::settings_set,
            commands::settings::providers,
            commands::settings::available_models,
            commands::settings::resolve_models,
            commands::settings::data_location,
        ])
        .run(tauri::generate_context!())
        .expect("error while running rundown");
}
