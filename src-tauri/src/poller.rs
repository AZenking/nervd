//! 流水线轮询：latestPipelineRun 状态迁移 → 前端事件 + 系统通知（openapi-rdc 版）

use crate::yunxiao::YunxiaoClient;
use crate::AppState;
use serde_json::json;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tauri::Emitter;

const POLL_INTERVAL: Duration = Duration::from_secs(60);
const MAX_PIPELINES: &str = "20";
const TERMINAL: [&str; 3] = ["SUCCESS", "FAIL", "CANCELED"];

pub fn spawn(app: tauri::AppHandle, inner: AppState) {
    tauri::async_runtime::spawn(async move {
        // key = "pipelineId:runId" -> 上次状态
        let mut seen: HashMap<String, String> = HashMap::new();
        loop {
            tokio::time::sleep(POLL_INTERVAL).await;
            let (client, org) = {
                let c = inner.client.lock().unwrap().clone();
                let o = inner.settings.lock().unwrap().organization_id.clone();
                (c, o)
            };
            let (Some(client), false) = (client, org.trim().is_empty()) else {
                continue;
            };
            if let Err(e) = scan_once(&app, &client, &org, &mut seen).await {
                eprintln!("[poller] {e}");
            }
            if seen.len() > 500 {
                seen.retain(|_, v| v == "RUNNING" || v == "WAITING");
            }
        }
    });
}

async fn scan_once(
    app: &tauri::AppHandle,
    client: &Arc<YunxiaoClient>,
    org: &str,
    seen: &mut HashMap<String, String>,
) -> Result<(), String> {
    let resp = client
        .get(
            &format!("/oapi/v1/flow/organizations/{org}/pipelines"),
            &[
                ("page", "1".to_string()),
                ("perPage", MAX_PIPELINES.to_string()),
            ],
        )
        .await?;
    let pipelines = resp
        .as_array()
        .cloned()
        .unwrap_or_else(|| {
            resp.get("pipelines")
                .and_then(|x| x.as_array())
                .cloned()
                .unwrap_or_default()
        });

    for p in &pipelines {
        let pid = p
            .get("id")
            .and_then(|x| x.as_i64())
            .or_else(|| p.get("pipelineId").and_then(|x| x.as_i64()))
            .unwrap_or(0);
        let pname = p
            .get("name")
            .and_then(|x| x.as_str())
            .or_else(|| p.get("pipelineName").and_then(|x| x.as_str()))
            .unwrap_or("?");
        if pid == 0 {
            continue;
        }
        let Ok(latest) = client
            .get(
                &format!("/oapi/v1/flow/organizations/{org}/pipelines/{pid}/runs/latestPipelineRun"),
                &[],
            )
            .await
        else {
            continue;
        };
        let rid = latest.get("pipelineRunId").and_then(|x| x.as_i64()).unwrap_or(0);
        let status = latest
            .get("status")
            .and_then(|x| x.as_str())
            .unwrap_or_default()
            .to_string();
        if rid == 0 || status.is_empty() {
            continue;
        }
        let key = format!("{pid}:{rid}");
        let prev = seen.insert(key.clone(), status.clone());
        let was_active = matches!(prev.as_deref(), Some("RUNNING") | Some("WAITING") | None);
        let now_terminal = TERMINAL.contains(&status.as_str());
        if was_active && now_terminal && prev.as_deref() != Some(status.as_str()) {
            let payload = json!({
                "pipelineId": pid,
                "pipelineName": pname,
                "runId": rid,
                "status": status,
            });
            let _ = app.emit("pipeline-run-finished", payload);
            use tauri_plugin_notification::NotificationExt;
            let _ = app
                .notification()
                .builder()
                .title("nervd · 流水线完成")
                .body(format!("{pname} #{rid} → {status}"))
                .show();
        }
    }
    Ok(())
}
