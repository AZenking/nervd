//! 流水线轮询：latestPipelineRun 状态迁移 → 前端事件 + 系统通知（openapi-rdc 版）

use crate::yunxiao::YunxiaoClient;
use crate::AppState;
use crate::{commands, credentials, jenkins::JenkinsClient};
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
        let mut seen_jenkins: HashMap<String, String> = HashMap::new();
        loop {
            tokio::time::sleep(POLL_INTERVAL).await;
            let (client, settings) = {
                let c = inner.client.lock().unwrap().clone();
                let s = inner.settings.lock().unwrap().clone();
                (c, s)
            };
            if let Some(client) = client {
                if !settings.organization_id.trim().is_empty() {
                    if let Err(e) =
                        scan_once(&app, &client, &settings.organization_id, &mut seen).await
                    {
                        eprintln!("[poller] {e}");
                    }
                }
            }
            if let Err(e) = scan_jenkins_once(&app, &inner, &settings, &mut seen_jenkins).await {
                eprintln!("[jenkins-poller] {e}");
            }
            if seen.len() > 500 {
                seen.retain(|_, v| v == "RUNNING" || v == "WAITING");
            }
        }
    });
}

async fn scan_jenkins_once(
    app: &tauri::AppHandle,
    app_state: &AppState,
    settings: &credentials::Settings,
    seen: &mut HashMap<String, String>,
) -> Result<(), String> {
    let mut jobs: HashMap<String, (credentials::JenkinsConnection, Vec<i64>, String)> =
        HashMap::new();
    for (repo_id, connection, job_full_name) in commands::repo_jenkins_jobs(settings) {
        let key = commands::jenkins_job_key(&connection.id, &job_full_name);
        jobs.entry(key)
            .and_modify(|(_, repos, _)| repos.push(repo_id))
            .or_insert((connection, vec![repo_id], job_full_name));
    }

    for (key, (connection, mut repo_ids, job_full_name)) in jobs {
        repo_ids.sort_unstable();
        let Some(token) = credentials::load_jenkins_token(&connection.id) else {
            continue;
        };
        let Ok(client) = JenkinsClient::new(&connection.base_url, &connection.username, &token)
        else {
            continue;
        };
        let Ok(runs) = client.list_runs(&job_full_name, 1).await else {
            continue;
        };
        let Some((run_id, status)) = commands::latest_jenkins_run(&runs) else {
            continue;
        };
        let run_key = format!("{key}:{run_id}");
        let previous = seen.insert(run_key, status.clone());
        let run_number = run_id.parse::<i64>().ok();
        let triggered_since = app_state
            .jenkins_trigger_baselines
            .lock()
            .unwrap()
            .get(&key)
            .and_then(|baselines| baselines.first())
            .copied()
            .zip(run_number)
            .is_some_and(|(baseline, current)| current > baseline);
        if commands::should_notify_jenkins_completion(previous.as_deref(), &status, triggered_since)
        {
            let payload = json!({
                "connectionId": connection.id,
                "jobFullName": job_full_name,
                "runId": run_id,
                "status": status,
                "repoIds": repo_ids,
            });
            let _ = app.emit("jenkins-build-finished", payload);
            use tauri_plugin_notification::NotificationExt;
            let _ = app
                .notification()
                .builder()
                .title("nervd · Jenkins 构建完成")
                .body(format!("{} #{run_id} → {status}", job_full_name))
                .show();

            let mut baselines = app_state.jenkins_trigger_baselines.lock().unwrap();
            if let Some(pending) = baselines.get_mut(&key) {
                if !pending.is_empty() {
                    pending.remove(0);
                }
                if pending.is_empty() {
                    baselines.remove(&key);
                }
            }
        }
    }
    Ok(())
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
    let pipelines = resp.as_array().cloned().unwrap_or_else(|| {
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
                &format!(
                    "/oapi/v1/flow/organizations/{org}/pipelines/{pid}/runs/latestPipelineRun"
                ),
                &[],
            )
            .await
        else {
            continue;
        };
        let rid = latest
            .get("pipelineRunId")
            .and_then(|x| x.as_i64())
            .unwrap_or(0);
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
        let was_active = matches!(prev.as_deref(), Some("RUNNING") | Some("WAITING"));
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
