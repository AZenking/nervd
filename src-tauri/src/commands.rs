//! 全部 Tauri 命令（IPC 表见 docs/ipc-contract.md §4）
//! 写操作统一走 ensure_write 门控；返回 Result<T, String>

use crate::credentials::{self, Settings};
use crate::yunxiao::YunxiaoClient;
use crate::AppState;
use serde_json::{json, Value};
use std::sync::Arc;
use tauri::State;

fn client_of(state: &State<'_, AppState>) -> Result<Arc<YunxiaoClient>, String> {
    state
        .client
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "NOT_CONFIGURED: 请先在设置中保存个人访问令牌与组织 ID".to_string())
}

fn org_of(state: &State<'_, AppState>) -> Result<String, String> {
    let s = state.settings.lock().unwrap();
    if s.organization_id.trim().is_empty() {
        return Err("NOT_CONFIGURED: 请先在设置中填写组织 ID".into());
    }
    Ok(s.organization_id.clone())
}

fn ensure_write(state: &State<'_, AppState>) -> Result<(), String> {
    if !state.settings.lock().unwrap().allow_write_ops {
        return Err("WRITE_DISABLED: 请在设置中开启写操作（需要写权限的个人令牌）".into());
    }
    Ok(())
}

fn rebuild(state: &State<'_, AppState>, app: &tauri::AppHandle) {
    let settings = credentials::load_settings(app);
    let client = credentials::load_pat()
        .and_then(|p| YunxiaoClient::new(&p).ok())
        .map(Arc::new);
    *state.settings.lock().unwrap() = settings;
    *state.client.lock().unwrap() = client;
}

fn s(v: &Value, key: &str) -> String {
    v.get(key)
        .and_then(|x| x.as_str())
        .unwrap_or_default()
        .to_string()
}
fn s_fallback(v: &Value, a: &str, b: &str) -> String {
    let x = s(v, a);
    if x.is_empty() { s(v, b) } else { x }
}
fn i64_of(v: &Value, key: &str) -> i64 {
    v.get(key).and_then(|x| x.as_i64()).unwrap_or(0)
}

// ---------- 凭证与设置 ----------

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<Value, String> {
    let st = state.settings.lock().unwrap().clone();
    let mut v = serde_json::to_value(&st).map_err(|e| e.to_string())?;
    if let Some(map) = v.as_object_mut() {
        map.insert("hasPat".into(), json!(credentials::load_pat().is_some()));
    }
    Ok(v)
}

#[tauri::command]
pub async fn save_settings(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    settings: Settings,
) -> Result<Value, String> {
    credentials::save_settings(&app, &settings)?;
    rebuild(&state, &app);
    get_settings(state).await
}

#[tauri::command]
pub async fn save_pat(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    pat: String,
) -> Result<bool, String> {
    credentials::save_pat(&pat)?;
    rebuild(&state, &app);
    Ok(true)
}

#[tauri::command]
pub async fn delete_pat(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<bool, String> {
    credentials::delete_pat()?;
    rebuild(&state, &app);
    Ok(true)
}

#[tauri::command]
pub async fn check_connection(state: State<'_, AppState>) -> Result<Value, String> {
    let c = client_of(&state)?;
    let resp = c.get("/organizations/list", &[]).await?;
    let mut orgs = vec![];
    if let Some(list) = resp
        .pointer("/result/result")
        .and_then(|x| x.as_array())
    {
        for o in list {
            orgs.push(json!({
                "organizationId": s(o, "organizationId"),
                "organizationName": s(o, "organizationName"),
                "accessLevel": o.get("accessLevel").and_then(|x| x.as_i64()),
            }));
        }
    }
    Ok(Value::Array(orgs))
}

// ---------- 工作项 ----------

#[tauri::command]
pub async fn list_workitems(
    state: State<'_, AppState>,
    category: String,
    space_identifier: String,
    next_token: Option<String>,
) -> Result<Value, String> {
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    if space_identifier.trim().is_empty() {
        return Err("NOT_CONFIGURED: 请先在设置中选择默认项目空间".into());
    }
    let mut q = vec![
        ("spaceType", "Project".to_string()),
        ("spaceIdentifier", space_identifier),
        ("category", category.clone()),
        ("maxResults", "50".to_string()),
    ];
    if let Some(t) = next_token {
        if !t.is_empty() {
            q.push(("nextToken", t));
        }
    }
    let resp = c.get(&format!("/organization/{org}/listWorkitems"), &q).await?;
    let items: Vec<Value> = resp
        .pointer("/workitems/workitem")
        .and_then(|x| x.as_array())
        .map(|arr| {
            arr.iter()
                .map(|w| {
                    json!({
                        "identifier": s(w, "identifier"),
                        "workitemId": s(w, "id"),
                        "subject": s(w, "subject"),
                        "status": s(w, "status"),
                        "statusStageName": s(w, "statusStageName"),
                        "assignedTo": s(w, "assignedTo"),
                        "spaceName": s(w, "spaceName"),
                        "updatedAt": s(w, "updatedAt"),
                        "category": category,
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    let next = resp
        .get("nextToken")
        .and_then(|x| x.as_str())
        .filter(|t| !t.is_empty())
        .map(|t| t.to_string());
    Ok(json!({ "items": items, "nextToken": next }))
}

#[tauri::command]
pub async fn get_workitem(state: State<'_, AppState>, workitem_id: String) -> Result<Value, String> {
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    c.get(&format!("/organization/{org}/workitems/{workitem_id}"), &[]).await
}

#[tauri::command]
pub async fn list_workitem_comments(state: State<'_, AppState>, workitem_id: String) -> Result<Value, String> {
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    c.get(&format!("/organization/{org}/workitems/{workitem_id}/commentList"), &[]).await
}

#[tauri::command]
pub async fn update_workitem_status(
    state: State<'_, AppState>,
    workitem_id: String,
    status_identifier: String,
) -> Result<Value, String> {
    ensure_write(&state)?;
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    // body 字段名以联调为准（云效 UpdateWorkItem 文档未随 CLI 元数据给出细粒度 schema）
    let body = json!({ "identifier": workitem_id, "statusIdentifier": status_identifier });
    c.post(&format!("/organization/{org}/workitems/update"), &[], body).await
}

// ---------- 仓库 / 分支 / commit ----------

#[tauri::command]
pub async fn list_repos(state: State<'_, AppState>, search: Option<String>, page: Option<i64>) -> Result<Value, String> {
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    let mut q = vec![
        ("organizationId", org),
        ("page", page.unwrap_or(1).to_string()),
        ("perPage", "50".to_string()),
    ];
    if let Some(kw) = search {
        if !kw.trim().is_empty() {
            q.push(("search", kw));
        }
    }
    let resp = c.get("/repository/list", &q).await?;
    let items: Vec<Value> = resp
        .pointer("/result/Result")
        .and_then(|x| x.as_array())
        .map(|arr| {
            arr.iter()
                .map(|r| {
                    json!({
                        "id": i64_of(r, "Id").max(i64_of(r, "id")),
                        "name": s(r, "name"),
                        "pathWithNamespace": s_fallback(r, "pathWithNamespace", "path_with_namespace"),
                        "lastActivityAt": s_fallback(r, "lastActivityAt", "last_activity_at"),
                    })
                })
                .filter(|r| r["id"].as_i64().unwrap_or(0) > 0)
                .collect()
        })
        .unwrap_or_default();
    Ok(Value::Array(items))
}

#[tauri::command]
pub async fn list_branches(state: State<'_, AppState>, repo_id: i64, search: Option<String>) -> Result<Value, String> {
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    let mut q = vec![
        ("organizationId", org),
        ("page", "1".to_string()),
        ("pageSize", "100".to_string()),
    ];
    if let Some(kw) = search {
        if !kw.trim().is_empty() {
            q.push(("search", kw));
        }
    }
    c.get(&format!("/repository/{repo_id}/branches"), &q).await
}

#[tauri::command]
pub async fn create_branch(state: State<'_, AppState>, repo_id: i64, branch_name: String, ref_name: String) -> Result<Value, String> {
    ensure_write(&state)?;
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    let body = json!({ "branchName": branch_name, "ref": ref_name });
    c.post(&format!("/repository/{repo_id}/branches"), &[("organizationId", org)], body).await
}

#[tauri::command]
pub async fn list_repository_commits(state: State<'_, AppState>, repo_id: i64, page: Option<i64>) -> Result<Value, String> {
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    let q = vec![
        ("organizationId", org),
        ("page", page.unwrap_or(1).to_string()),
        ("pageSize", "50".to_string()),
    ];
    c.get(&format!("/repository/{repo_id}/commits"), &q).await
}

// ---------- MR ----------

#[tauri::command]
pub async fn list_merge_requests(state: State<'_, AppState>, repo_id: i64, _state_filter: Option<String>) -> Result<Value, String> {
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    // GitLab v4 兼容族（与 MergeMergeRequest 同族）；联调若 404 回退 /api/v4/projects/merge_requests/advanced_search
    let q = vec![
        ("organizationId", org),
        ("page", "1".to_string()),
        ("pageSize", "50".to_string()),
    ];
    c.get(&format!("/api/v4/projects/{repo_id}/merge_requests"), &q).await
}

#[tauri::command]
pub async fn create_merge_request(
    state: State<'_, AppState>,
    repo_id: i64,
    title: String,
    source_branch: String,
    target_branch: String,
    description: Option<String>,
) -> Result<Value, String> {
    ensure_write(&state)?;
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    let mut body = json!({
        "title": title,
        "sourceBranch": source_branch,
        "targetBranch": target_branch,
    });
    if let Some(d) = description {
        body["description"] = json!(d);
    }
    c.post(&format!("/repository/{repo_id}/merge_requests"), &[("organizationId", org)], body).await
}

#[tauri::command]
pub async fn merge_merge_request(state: State<'_, AppState>, repo_id: i64, local_id: i64) -> Result<Value, String> {
    ensure_write(&state)?;
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    c.post(
        &format!("/api/v4/projects/{repo_id}/merge_requests/{local_id}/merge"),
        &[("organizationId", org)],
        json!({}),
    )
    .await
}

// ---------- 流水线 ----------

#[tauri::command]
pub async fn list_pipelines(state: State<'_, AppState>, max_results: Option<i64>) -> Result<Value, String> {
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    let q = vec![("maxResults", max_results.unwrap_or(50).to_string())];
    let resp = c.get(&format!("/organization/{org}/pipelines"), &q).await?;
    let items: Vec<Value> = resp
        .pointer("/pipelines/Pipeline")
        .and_then(|x| x.as_array())
        .map(|arr| {
            arr.iter()
                .map(|p| {
                    json!({
                        "pipelineId": i64_of(p, "pipelineId"),
                        "pipelineName": s(p, "pipelineName"),
                        "status": s(p, "status"),
                        "updateTime": s(p, "updateTime"),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    Ok(Value::Array(items))
}

#[tauri::command]
pub async fn list_pipeline_runs(state: State<'_, AppState>, pipeline_id: i64, max_results: Option<i64>) -> Result<Value, String> {
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    let q = vec![("maxResults", max_results.unwrap_or(20).to_string())];
    let resp = c
        .get(&format!("/organization/{org}/pipelines/{pipeline_id}/pipelineRuns"), &q)
        .await?;
    let items: Vec<Value> = resp
        .pointer("/pipelineRuns/PipelineRun")
        .and_then(|x| x.as_array())
        .map(|arr| {
            arr.iter()
                .map(|r| {
                    json!({
                        "pipelineRunId": i64_of(r, "pipelineRunId"),
                        "status": s(r, "status"),
                        "startTime": r.get("startTime").and_then(|x| x.as_i64()),
                        "endTime": r.get("endTime").and_then(|x| x.as_i64()),
                        "executorAccountId": s(r, "executorAccountId"),
                        "triggerMode": r.get("triggerMode").and_then(|x| x.as_i64()),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    Ok(Value::Array(items))
}

#[tauri::command]
pub async fn get_pipeline_run(state: State<'_, AppState>, pipeline_id: i64, run_id: i64) -> Result<Value, String> {
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    c.get(&format!("/organization/{org}/pipelines/{pipeline_id}/pipelineRuns/{run_id}"), &[]).await
}

#[tauri::command]
pub async fn start_pipeline_run(state: State<'_, AppState>, pipeline_id: i64) -> Result<Value, String> {
    ensure_write(&state)?;
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    c.post(&format!("/organizations/{org}/pipelines/{pipeline_id}/run"), &[], json!({})).await
}

#[tauri::command]
pub async fn stop_pipeline_run(state: State<'_, AppState>, pipeline_id: i64, run_id: i64) -> Result<Value, String> {
    ensure_write(&state)?;
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    c.put(&format!("/organization/{org}/pipelines/{pipeline_id}/pipelineRuns/{run_id}/stop"), &[]).await
}

#[tauri::command]
pub async fn get_job_logs(state: State<'_, AppState>, pipeline_id: i64, run_id: i64, job_id: i64) -> Result<String, String> {
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    let resp = c
        .get(
            &format!("/organization/{org}/pipeline/{pipeline_id}/pipelineRun/{run_id}/job/{job_id}/logs"),
            &[],
        )
        .await?;
    // 响应结构以联调为准：优先拼接 result 数组，否则整体序列化
    if let Some(arr) = resp.get("result").and_then(|x| x.as_array()) {
        let mut out = String::new();
        for line in arr {
            let t = serde_json::to_string_pretty(line).unwrap_or_default();
            out.push_str(&t);
            out.push('\n');
        }
        return Ok(out);
    }
    Ok(serde_json::to_string_pretty(&resp).unwrap_or_default())
}
