use super::*;

pub(super) fn handle_codex_event(
    app: &AppHandle,
    spec: &RunSpec,
    event: &serde_json::Value,
    assembled: &mut String,
    session_id: &mut Option<String>,
    announced: &mut bool,
    failure: &mut Option<String>,
) {
    let kind = event.get("type").and_then(|v| v.as_str()).unwrap_or("");

    match kind {
        "thread.started" => {
            if let Some(id) = event.get("thread_id").and_then(|v| v.as_str()) {
                *session_id = Some(id.to_string());
            }
            if !*announced {
                *announced = true;
                emit(
                    app,
                    AiEvent::Started {
                        run_id: spec.run_id.clone(),
                        provider: spec.provider,
                        model: spec.model.clone(),
                        session_id: session_id.clone(),
                    },
                );
            }
        }
        "item.completed" => {
            let item = match event.get("item") {
                Some(item) => item,
                None => return,
            };
            match item.get("type").and_then(|v| v.as_str()) {
                Some("agent_message") => {
                    if let Some(text) = item.get("text").and_then(|v| v.as_str()) {
                        assembled.push_str(text);
                        emit(
                            app,
                            AiEvent::Delta {
                                run_id: spec.run_id.clone(),
                                text: text.to_string(),
                            },
                        );
                    }
                }
                Some("error") => {
                    let message = item
                        .get("message")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default();
                    // Codex reports config deprecations as errors; those are noise.
                    if message.contains("deprecated") || message.contains("clamping") {
                        return;
                    }
                    *failure = Some(message.to_string());
                }
                _ => {}
            }
        }
        _ => {}
    }
}
