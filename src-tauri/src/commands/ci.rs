use super::common::{as_array, client_of, ensure_write, i64_of, org_of, s};
use crate::credentials::{self, JenkinsConnection, RepoCiBinding, Settings};
use crate::jenkins::{JenkinsClient, JenkinsLogChunk};
use crate::AppState;
use serde_json::{json, Value};
use tauri::State;

fn configured_connection(settings: &Settings, id: &str) -> Result<JenkinsConnection, String> {
    settings
        .jenkins_connections
        .iter()
        .find(|connection| connection.id == id)
        .cloned()
        .ok_or_else(|| format!("Jenkins 实例不存在: {id}"))
}

fn jenkins_client(settings: &Settings, id: &str) -> Result<JenkinsClient, String> {
    let connection = configured_connection(settings, id)?;
    let token = credentials::load_jenkins_token(id)
        .ok_or_else(|| format!("Jenkins 实例「{}」尚未保存 API Token", connection.name))?;
    JenkinsClient::new(&connection.base_url, &connection.username, &token)
}

fn repo_binding(settings: &Settings, repo_id: i64) -> Result<RepoCiBinding, String> {
    settings
        .repo_ci_bindings
        .get(&repo_id)
        .cloned()
        .ok_or_else(|| format!("仓库 #{repo_id} 尚未配置 CI Job"))
}

pub fn jenkins_job_key(connection_id: &str, job_full_name: &str) -> String {
    format!("{connection_id}:{job_full_name}")
}

fn map_flow_run(run: &Value) -> Option<Value> {
    let run_id = i64_of(run, "pipelineRunId")?;
    let status = s(run, "status");
    let start = i64_of(run, "createTime").or_else(|| i64_of(run, "startTime"));
    let end = i64_of(run, "updateTime").or_else(|| i64_of(run, "endTime"));
    Some(json!({
        "runId": run_id.to_string(),
        "status": status,
        "startTime": start,
        "durationMs": start.zip(end).map(|(start, end)| (end - start).max(0)),
        "trigger": i64_of(run, "triggerMode").map(|mode| mode.to_string()),
    }))
}

async fn flow_runs(
    state: &State<'_, AppState>,
    pipeline_id: i64,
    limit: i64,
) -> Result<Vec<Value>, String> {
    let client = client_of(state)?;
    let org = org_of(state)?;
    let response = client
        .get(
            &format!("/oapi/v1/flow/organizations/{org}/pipelines/{pipeline_id}/runs"),
            &[("page", "1".into()), ("perPage", limit.to_string())],
        )
        .await?;
    Ok(as_array(&response)
        .iter()
        .filter_map(map_flow_run)
        .collect())
}

#[tauri::command]
pub async fn save_jenkins_token(
    state: State<'_, AppState>,
    connection_id: String,
    token: String,
) -> Result<bool, String> {
    let settings = state.settings.lock().unwrap().clone();
    configured_connection(&settings, &connection_id)?;
    credentials::save_jenkins_token(&connection_id, &token)?;
    Ok(true)
}

#[tauri::command]
pub async fn delete_jenkins_token(
    state: State<'_, AppState>,
    connection_id: String,
) -> Result<bool, String> {
    let settings = state.settings.lock().unwrap().clone();
    if settings
        .jenkins_connections
        .iter()
        .any(|item| item.id == connection_id)
    {
        return Err("请先从设置中删除该 Jenkins 实例，再移除 Keychain Token".into());
    }
    credentials::delete_jenkins_token(&connection_id)?;
    Ok(true)
}

#[tauri::command]
pub async fn test_jenkins_connection(
    connection: JenkinsConnection,
    token: Option<String>,
) -> Result<String, String> {
    let token = token
        .filter(|value| !value.trim().is_empty())
        .or_else(|| credentials::load_jenkins_token(&connection.id))
        .ok_or_else(|| "请先输入并保存 Jenkins API Token".to_string())?;
    let client = JenkinsClient::new(&connection.base_url, &connection.username, &token)?;
    client.test_connection().await?;
    Ok(format!("{} 连接正常", connection.name))
}

#[tauri::command]
pub async fn get_jenkins_job(
    state: State<'_, AppState>,
    connection_id: String,
    job_full_name: String,
) -> Result<Value, String> {
    let settings = state.settings.lock().unwrap().clone();
    let client = jenkins_client(&settings, &connection_id)?;
    let job = client.get_job(&job_full_name).await?;
    serde_json::to_value(job).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_jenkins_jobs(
    state: State<'_, AppState>,
    connection_id: String,
) -> Result<Value, String> {
    let settings = state.settings.lock().unwrap().clone();
    let client = jenkins_client(&settings, &connection_id)?;
    let jobs = client.list_jobs().await?;
    serde_json::to_value(jobs).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_jenkins_job_parameters(
    state: State<'_, AppState>,
    connection_id: String,
    job_full_name: String,
) -> Result<Value, String> {
    let settings = state.settings.lock().unwrap().clone();
    let client = jenkins_client(&settings, &connection_id)?;
    let parameters = client.get_job_parameters(&job_full_name).await?;
    serde_json::to_value(parameters).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_repo_ci_snapshot(
    state: State<'_, AppState>,
    repo_id: i64,
    max_results: Option<i64>,
) -> Result<Value, String> {
    let settings = state.settings.lock().unwrap().clone();
    let binding = repo_binding(&settings, repo_id)?;
    let limit = max_results.unwrap_or(5).clamp(1, 20);
    match binding {
        RepoCiBinding::Flow {
            pipeline_id,
            pipeline_name,
            ..
        } => {
            let runs = flow_runs(&state, pipeline_id, limit).await?;
            let status = runs.first().and_then(|run| run.get("status")).cloned();
            Ok(json!({
                "provider": "flow",
                "name": pipeline_name,
                "status": status,
                "runs": runs,
            }))
        }
        RepoCiBinding::Jenkins {
            connection_id,
            job_full_name,
            ..
        } => {
            let client = jenkins_client(&settings, &connection_id)?;
            let runs = client.list_runs(&job_full_name, limit as usize).await?;
            let status = runs.first().map(|run| run.status.clone());
            Ok(json!({
                "provider": "jenkins",
                "name": job_full_name,
                "status": status,
                "runs": runs,
            }))
        }
    }
}

#[tauri::command]
pub async fn trigger_repo_ci(
    state: State<'_, AppState>,
    repo_id: i64,
    params: Option<Value>,
) -> Result<Value, String> {
    ensure_write(&state)?;
    let settings = state.settings.lock().unwrap().clone();
    match repo_binding(&settings, repo_id)? {
        RepoCiBinding::Flow {
            pipeline_id,
            parameters: default_params,
            ..
        } => {
            let client = client_of(&state)?;
            let org = org_of(&state)?;
            let mut final_map = serde_json::Map::new();
            for (k, v) in default_params {
                final_map.insert(k, Value::String(v));
            }
            if let Some(passed) = params {
                if let Some(passed_obj) = passed.as_object() {
                    for (k, v) in passed_obj {
                        final_map.insert(k.clone(), v.clone());
                    }
                }
            }
            client
                .post(
                    &format!("/oapi/v1/flow/organizations/{org}/pipelines/{pipeline_id}/runs"),
                    &[],
                    json!({ "params": Value::Object(final_map) }),
                )
                .await
        }
        RepoCiBinding::Jenkins {
            connection_id,
            job_full_name,
            parameters,
            ..
        } => {
            let client = jenkins_client(&settings, &connection_id)?;
            let baseline = client
                .list_runs(&job_full_name, 1)
                .await
                .ok()
                .and_then(|runs| runs.first().and_then(|run| run.run_id.parse::<i64>().ok()))
                .unwrap_or(0);
            let queue_url = client
                .trigger_build_with_parameters(&job_full_name, &parameters)
                .await?;
            let queue_id = queue_url.as_deref().and_then(crate::jenkins::extract_queue_id);
            state
                .jenkins_trigger_baselines
                .lock()
                .unwrap()
                .entry(jenkins_job_key(&connection_id, &job_full_name))
                .or_default()
                .push(baseline);
            Ok(json!({
                "queueUrl": queue_url,
                "queueId": queue_id,
                "repoId": repo_id,
                "connectionId": connection_id,
                "jobFullName": job_full_name
            }))
        }
    }
}

#[tauri::command]
pub async fn trigger_jenkins_job(
    state: State<'_, AppState>,
    repo_id: i64,
    connection_id: String,
    job_full_name: String,
    parameters: std::collections::HashMap<String, String>,
) -> Result<Value, String> {
    ensure_write(&state)?;
    if repo_id <= 0 || job_full_name.trim().is_empty() {
        return Err("仓库或 Jenkins Job 无效".into());
    }
    let settings = state.settings.lock().unwrap().clone();
    let client = jenkins_client(&settings, &connection_id)?;
    let baseline = client
        .list_runs(&job_full_name, 1)
        .await
        .ok()
        .and_then(|runs| runs.first().and_then(|run| run.run_id.parse::<i64>().ok()))
        .unwrap_or(0);
    let queue_url = client
        .trigger_build_with_parameters(&job_full_name, &parameters)
        .await?;
    let queue_id = queue_url.as_deref().and_then(crate::jenkins::extract_queue_id);
    state
        .jenkins_trigger_baselines
        .lock()
        .unwrap()
        .entry(jenkins_job_key(&connection_id, &job_full_name))
        .or_default()
        .push(baseline);
    Ok(json!({
        "queueUrl": queue_url,
        "queueId": queue_id,
        "repoId": repo_id,
        "connectionId": connection_id,
        "jobFullName": job_full_name
    }))
}

#[tauri::command]
pub async fn get_jenkins_queue_item(
    state: State<'_, AppState>,
    connection_id: String,
    queue_id: String,
) -> Result<Value, String> {
    let settings = state.settings.lock().unwrap().clone();
    let client = jenkins_client(&settings, &connection_id)?;
    client.get_queue_item(&queue_id).await
}

#[tauri::command]
pub async fn get_jenkins_job_runs(
    state: State<'_, AppState>,
    connection_id: String,
    job_full_name: String,
    limit: Option<i64>,
) -> Result<Vec<crate::jenkins::CiRunSummary>, String> {
    let settings = state.settings.lock().unwrap().clone();
    let client = jenkins_client(&settings, &connection_id)?;
    let max = limit.unwrap_or(5).clamp(1, 50) as usize;
    client.list_runs(&job_full_name, max).await
}

#[tauri::command]
pub async fn get_jenkins_job_logs(
    state: State<'_, AppState>,
    connection_id: String,
    job_full_name: String,
    run_id: String,
) -> Result<String, String> {
    let settings = state.settings.lock().unwrap().clone();
    let client = jenkins_client(&settings, &connection_id)?;
    client.console_text(&job_full_name, &run_id).await
}

#[tauri::command]
pub async fn get_jenkins_job_log_chunk(
    state: State<'_, AppState>,
    connection_id: String,
    job_full_name: String,
    run_id: String,
    start_offset: u64,
) -> Result<crate::jenkins::JenkinsLogChunk, String> {
    let settings = state.settings.lock().unwrap().clone();
    let client = jenkins_client(&settings, &connection_id)?;
    client
        .progressive_console_chunk(&job_full_name, &run_id, start_offset)
        .await
}

#[tauri::command]
pub async fn get_jenkins_job_stages(
    state: State<'_, AppState>,
    connection_id: String,
    job_full_name: String,
    run_id: String,
) -> Result<Vec<crate::jenkins::JenkinsPipelineStage>, String> {
    let settings = state.settings.lock().unwrap().clone();
    let client = jenkins_client(&settings, &connection_id)?;
    client.pipeline_stages(&job_full_name, &run_id).await
}

#[tauri::command]
pub async fn get_repo_ci_logs(
    state: State<'_, AppState>,
    repo_id: i64,
    run_id: String,
) -> Result<String, String> {
    let settings = state.settings.lock().unwrap().clone();
    match repo_binding(&settings, repo_id)? {
        RepoCiBinding::Jenkins {
            connection_id,
            job_full_name,
            ..
        } => {
            let client = jenkins_client(&settings, &connection_id)?;
            client.console_text(&job_full_name, &run_id).await
        }
        RepoCiBinding::Flow { pipeline_id, .. } => {
            let run_number = run_id
                .parse::<i64>()
                .map_err(|_| "云效运行编号无效".to_string())?;
            let client = client_of(&state)?;
            let org = org_of(&state)?;
            let detail = client
                .get(
                    &format!("/oapi/v1/flow/organizations/{org}/pipelines/{pipeline_id}/runs/{run_number}"),
                    &[],
                )
                .await?;
            let jobs = detail
                .get("pipelineRun")
                .and_then(|run| run.get("jobs"))
                .or_else(|| detail.get("jobs"))
                .ok_or_else(|| "未在运行详情中找到 job，无法取日志".to_string())?;
            let job_items = jobs.get("Job").or_else(|| jobs.get("job")).unwrap_or(jobs);
            let job_id = job_items
                .as_array()
                .and_then(|items| items.first())
                .and_then(|job| i64_of(job, "jobId").or_else(|| i64_of(job, "id")))
                .or_else(|| i64_of(job_items, "jobId").or_else(|| i64_of(job_items, "id")))
                .ok_or_else(|| "运行详情中没有可读取日志的 job".to_string())?;
            let response = client
                .get(
                    &format!("/oapi/v1/flow/organizations/{org}/pipelines/{pipeline_id}/runs/{run_number}/job/{job_id}/log"),
                    &[],
                )
                .await?;
            if let Some(lines) = response
                .as_array()
                .or_else(|| response.get("logs").and_then(Value::as_array))
            {
                return Ok(lines
                    .iter()
                    .map(|line| {
                        line.as_str()
                            .map(str::to_string)
                            .unwrap_or_else(|| line.to_string())
                    })
                    .collect::<Vec<_>>()
                    .join("\n"));
            }
            Ok(serde_json::to_string_pretty(&response).unwrap_or_default())
        }
    }
}

#[tauri::command]
pub async fn get_repo_ci_log_chunk(
    state: State<'_, AppState>,
    repo_id: i64,
    run_id: String,
    start_offset: u64,
) -> Result<JenkinsLogChunk, String> {
    let settings = state.settings.lock().unwrap().clone();
    let RepoCiBinding::Jenkins {
        connection_id,
        job_full_name,
        ..
    } = repo_binding(&settings, repo_id)?
    else {
        return Err("增量日志当前仅支持 Jenkins".into());
    };
    let client = jenkins_client(&settings, &connection_id)?;
    client
        .progressive_console_chunk(&job_full_name, &run_id, start_offset)
        .await
}

#[tauri::command]
pub async fn get_repo_ci_stages(
    state: State<'_, AppState>,
    repo_id: i64,
    run_id: String,
) -> Result<Vec<crate::jenkins::JenkinsPipelineStage>, String> {
    let settings = state.settings.lock().unwrap().clone();
    match repo_binding(&settings, repo_id)? {
        RepoCiBinding::Jenkins {
            connection_id,
            job_full_name,
            ..
        } => {
            let client = jenkins_client(&settings, &connection_id)?;
            client.pipeline_stages(&job_full_name, &run_id).await
        }
        RepoCiBinding::Flow { pipeline_id, .. } => {
            let run_number = run_id
                .parse::<i64>()
                .map_err(|_| "云效运行编号无效".to_string())?;
            let client = client_of(&state)?;
            let org = org_of(&state)?;
            let detail = client
                .get(
                    &format!("/oapi/v1/flow/organizations/{org}/pipelines/{pipeline_id}/runs/{run_number}"),
                    &[],
                )
                .await
                .map_err(|e| format!("读取云效运行详情失败: {e}"))?;

            let mut stages = Vec::new();
            let raw_stages = detail
                .get("stages")
                .or_else(|| detail.get("pipelineRun").and_then(|r| r.get("stages")))
                .and_then(Value::as_array);

            if let Some(list) = raw_stages {
                for item in list {
                    let id = item
                        .get("id")
                        .or_else(|| item.get("stageId"))
                        .and_then(|v| v.as_str().map(String::from).or_else(|| v.as_i64().map(|n| n.to_string())))
                        .unwrap_or_default();
                    let name = item
                        .get("name")
                        .and_then(Value::as_str)
                        .unwrap_or("Stage")
                        .to_string();
                    let status = item
                        .get("status")
                        .and_then(Value::as_str)
                        .unwrap_or("UNKNOWN")
                        .to_string();
                    stages.push(crate::jenkins::JenkinsPipelineStage {
                        id,
                        name,
                        status,
                        start_time_millis: None,
                        duration_millis: None,
                        pause_duration_millis: None,
                    });
                }
            }
            Ok(stages)
        }
    }
}

pub fn jenkins_terminal(status: &str) -> bool {
    matches!(status, "SUCCESS" | "FAIL" | "CANCELED" | "OTHER")
}

pub fn should_notify_jenkins_completion(
    previous_status: Option<&str>,
    current_status: &str,
    triggered_since_baseline: bool,
) -> bool {
    let active_transition = matches!(previous_status, Some("RUNNING" | "WAITING"));
    let first_seen_triggered = previous_status.is_none() && triggered_since_baseline;
    (active_transition || first_seen_triggered)
        && jenkins_terminal(current_status)
        && previous_status != Some(current_status)
}

pub fn repo_jenkins_jobs(settings: &Settings) -> Vec<(i64, JenkinsConnection, String)> {
    settings
        .repo_ci_bindings
        .iter()
        .filter_map(|(repo_id, binding)| match binding {
            RepoCiBinding::Jenkins {
                connection_id,
                job_full_name,
                ..
            } => settings
                .jenkins_connections
                .iter()
                .find(|connection| connection.id == *connection_id)
                .cloned()
                .map(|connection| (*repo_id, connection, job_full_name.clone())),
            RepoCiBinding::Flow { .. } => None,
        })
        .collect()
}

pub fn latest_jenkins_run(runs: &[crate::jenkins::CiRunSummary]) -> Option<(String, String)> {
    runs.first()
        .map(|run| (run.run_id.clone(), run.status.clone()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_notifies_observed_or_recently_triggered_completion() {
        assert!(!should_notify_jenkins_completion(None, "SUCCESS", false));
        assert!(should_notify_jenkins_completion(None, "SUCCESS", true));
        assert!(should_notify_jenkins_completion(
            Some("RUNNING"),
            "SUCCESS",
            false
        ));
        assert!(!should_notify_jenkins_completion(
            Some("RUNNING"),
            "RUNNING",
            false
        ));
        assert!(!should_notify_jenkins_completion(
            Some("SUCCESS"),
            "SUCCESS",
            true
        ));
    }

    #[test]
    fn flow_binding_supports_branch_parameter_and_custom_params() {
        let json_str = r#"{
            "provider": "flow",
            "pipelineId": 12345,
            "pipelineName": "test-pipeline",
            "branchParameter": "custom_branch",
            "parameters": {
                "ENV": "staging"
            }
        }"#;
        let binding: RepoCiBinding = serde_json::from_str(json_str).unwrap();
        match binding {
            RepoCiBinding::Flow {
                pipeline_id,
                pipeline_name,
                branch_parameter,
                parameters,
            } => {
                assert_eq!(pipeline_id, 12345);
                assert_eq!(pipeline_name, "test-pipeline");
                assert_eq!(branch_parameter, Some("custom_branch".to_string()));
                assert_eq!(parameters.get("ENV"), Some(&"staging".to_string()));
            }
            _ => panic!("Expected Flow binding"),
        }
    }

    #[test]
    fn flow_binding_backward_compatible_without_optional_fields() {
        let json_str = r#"{
            "provider": "flow",
            "pipelineId": 67890,
            "pipelineName": "legacy-flow"
        }"#;
        let binding: RepoCiBinding = serde_json::from_str(json_str).unwrap();
        match binding {
            RepoCiBinding::Flow {
                pipeline_id,
                pipeline_name,
                branch_parameter,
                parameters,
            } => {
                assert_eq!(pipeline_id, 67890);
                assert_eq!(pipeline_name, "legacy-flow");
                assert_eq!(branch_parameter, None);
                assert!(parameters.is_empty());
            }
            _ => panic!("Expected Flow binding"),
        }
    }
}
