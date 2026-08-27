use super::*;

#[allow(clippy::too_many_arguments)]
pub(super) fn handle_claude_event(
    app: &AppHandle,
    spec: &RunSpec,
    event: &serde_json::Value,
    assembled: &mut String,
    session_id: &mut Option<String>,
    cost: &mut Option<f64>,
    announced: &mut bool,
    failure: &mut Option<String>,
) {
    let kind = event.get("type").and_then(|v| v.as_str()).unwrap_or("");

    if let Some(id) = event.get("session_id").and_then(|v| v.as_str()) {
        *session_id = Some(id.to_string());
    }

    match kind {
        "system" => {
            if event.get("subtype").and_then(|v| v.as_str()) == Some("init") && !*announced {
                *announced = true;
                emit(
                    app,
                    AiEvent::Started {
                        run_id: spec.run_id.clone(),
                        provider: spec.provider,
                        model: event
                            .get("model")
                            .and_then(|v| v.as_str())
                            .map(str::to_string)
                            .or_else(|| spec.model.clone()),
                        session_id: session_id.clone(),
                    },
                );
            }
        }
        "rate_limit_event" => {
            let info = event.get("rate_limit_info");
            emit(
                app,
                AiEvent::RateLimit {
                    run_id: spec.run_id.clone(),
                    status: info
                        .and_then(|v| v.get("status"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("unknown")
                        .to_string(),
                    window: info
                        .and_then(|v| v.get("rateLimitType"))
                        .and_then(|v| v.as_str())
                        .map(str::to_string),
                    resets_at: info.and_then(|v| v.get("resetsAt")).and_then(|v| v.as_i64()),
                },
            );
        }
        "stream_event" => {
            let inner = match event.get("event") {
                Some(inner) => inner,
                None => return,
            };
            if inner.get("type").and_then(|v| v.as_str()) != Some("content_block_delta") {
                return;
            }
            let delta = match inner.get("delta") {
                Some(delta) => delta,
                None => return,
            };
            if delta.get("type").and_then(|v| v.as_str()) != Some("text_delta") {
                return;
            }
            if let Some(text) = delta.get("text").and_then(|v| v.as_str()) {
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
        "result" => {
            if let Some(value) = event.get("total_cost_usd").and_then(|v| v.as_f64()) {
                *cost = Some(value);
            }
            let errored = event
                .get("is_error")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            if errored {
                *failure = Some(
                    event
                        .get("result")
                        .and_then(|v| v.as_str())
                        .unwrap_or("the model run failed")
                        .to_string(),
                );
                return;
            }
            // Deltas are the source of truth, but a run that produced none
            // still has its full text here.
            if assembled.trim().is_empty() {
                if let Some(text) = event.get("result").and_then(|v| v.as_str()) {
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
        }
        _ => {}
    }
}
