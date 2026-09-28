//! 全部 Tauri 命令（IPC 表见 docs/ipc-contract.md §4）
//! 底层走 openapi-rdc /oapi/v1（PAT），写操作统一 ensure_write 门控

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

// 响应取值助手（oapi/v1 字段风格：驼峰，状态/人是嵌套对象）
fn s(v: &Value, key: &str) -> String {
    v.get(key).and_then(|x| x.as_str()).unwrap_or_default().to_string()
}
fn s2(v: &Value, a: &str, b: &str) -> String {
    let x = s(v, a);
    if x.is_empty() { s(v, b) } else { x }
}
fn nested_s(v: &Value, outer: &str, inner: &str) -> String {
    v.get(outer)
        .and_then(|o| o.get(inner))
        .and_then(|x| x.as_str())
        .unwrap_or_default()
        .to_string()
}
fn i64_of(v: &Value, key: &str) -> Option<i64> {
    v.get(key).and_then(|x| x.as_i64())
}
fn as_array(v: &Value) -> Vec<Value> {
    match v {
        Value::Array(a) => a.clone(),
        Value::Object(_) => {
            // 兼容 {result:[...]} / {pipelines:[...]} 包装
            for k in ["result", "pipelines", "items", "data"] {
                if let Some(a) = v.get(k).and_then(|x| x.as_array()) {
                    return a.clone();
                }
                // 二级包装 result.Result
                if let Some(a) = v.get(k).and_then(|x| x.get("Result")).and_then(|x| x.as_array()) {
                    return a.clone();
                }
            }
            vec![]
        }
        _ => vec![],
    }
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

/// 验证 PAT：GET /oapi/v1/platform/user
#[tauri::command]
pub async fn check_connection(state: State<'_, AppState>) -> Result<Value, String> {
    let c = client_of(&state)?;
    let resp = c.get("/oapi/v1/platform/user", &[]).await?;
    Ok(json!([{
        "organizationId": s(&resp, "lastOrganization"),
        "organizationName": s(&resp, "name"),
        "accessLevel": Value::Null,
    }]))
}

/// 项目列表（设置页项目空间下拉）：POST projects:search
#[tauri::command]
pub async fn list_projects(state: State<'_, AppState>, search: Option<String>) -> Result<Value, String> {
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    let mut body = json!({ "page": 1, "perPage": 50 });
    if let Some(kw) = search {
        if !kw.trim().is_empty() {
            body["name"] = json!(kw);
        }
    }
    let resp = c
        .post(&format!("/oapi/v1/projex/organizations/{org}/projects:search"), &[], body)
        .await?;
    let items: Vec<Value> = as_array(&resp)
        .iter()
        .map(|p| {
            let id = {
                let a = s(p, "identifier");
                if a.is_empty() { s(p, "id") } else { a }
            };
            json!({
                "id": id,
                "name": s(p, "name"),
            })
        })
        .collect();
    Ok(Value::Array(items))
}

// ---------- 工作项 ----------

/// POST workitems:search（body: category/spaceId/spaceType/page/perPage）
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
    let page: u32 = next_token
        .and_then(|t| t.parse().ok())
        .unwrap_or(1);
    let per_page = 50u32;
    let body = json!({
        "category": category,
        "spaceId": space_identifier,
        "spaceType": "Project",
        "orderBy": "gmtModified",
        "sort": "desc",
        "page": page,
        "perPage": per_page,
    });
    let resp = c
        .post(&format!("/oapi/v1/projex/organizations/{org}/workitems:search"), &[], body)
        .await?;
    let items: Vec<Value> = as_array(&resp)
        .iter()
        .map(|w| {
            let ident = {
                let a = s(w, "identifier");
                if a.is_empty() { s(w, "serialNumber") } else { a }
            };
            json!({
                "identifier": ident,
                "workitemId": s(w, "id"),
                "subject": s(w, "subject"),
                "status": nested_s(w, "status", "name"),
                "statusStageName": nested_s(w, "status", "stageName"),
                "assignedTo": nested_s(w, "assignedTo", "name"),
                "spaceName": nested_s(w, "space", "name"),
                "updatedAt": i64_of(w, "gmtModified").map(chrono_ms_to_local).unwrap_or_default(),
                "category": category,
            })
        })
        .collect();
    let next = if (items.len() as u32) >= per_page {
        Some((page + 1).to_string())
    } else {
        None
    };
    Ok(json!({ "items": items, "nextToken": next }))
}

fn chrono_ms_to_local(ms: i64) -> String {
    // 无 chrono：用系统 date 不可取（无 shell）；手写 ms→UTC 粗转换仅用于展示
    let secs = ms / 1000;
    let days = secs / 86400;
    let rem = secs % 86400;
    let (h, mi, se) = (rem / 3600, (rem % 3600) / 60, rem % 60);
    // 1970-01-01 起的天数 → 年月日（民用算法）
    let (y, mo, d) = civil_from_days(days);
    format!("{y:04}-{mo:02}-{d:02} {h:02}:{mi:02}:{se:02}")
}

fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as i64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = (if mp < 10 { mp + 3 } else { mp - 9 }) as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

#[tauri::command]
pub async fn get_workitem(state: State<'_, AppState>, workitem_id: String) -> Result<Value, String> {
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    c.get(&format!("/oapi/v1/projex/organizations/{org}/workitems/{workitem_id}"), &[]).await
}

#[tauri::command]
pub async fn list_workitem_comments(state: State<'_, AppState>, workitem_id: String) -> Result<Value, String> {
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    c.get(
        &format!("/oapi/v1/projex/organizations/{org}/workitems/{workitem_id}/comments"),
        &[("page", "1".to_string()), ("perPage", "50".to_string())],
    )
    .await
}

/// PUT workitems/{id} body {status}
#[tauri::command]
pub async fn update_workitem_status(
    state: State<'_, AppState>,
    workitem_id: String,
    status_identifier: String,
) -> Result<Value, String> {
    ensure_write(&state)?;
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    c.put(
        &format!("/oapi/v1/projex/organizations/{org}/workitems/{workitem_id}"),
        &[],
        json!({ "status": status_identifier }),
    )
    .await
}

// ---------- 仓库 / 分支 / commit ----------

#[tauri::command]
pub async fn list_repos(state: State<'_, AppState>, search: Option<String>, page: Option<i64>) -> Result<Value, String> {
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    let mut q = vec![
        ("page", page.unwrap_or(1).to_string()),
        ("perPage", "50".to_string()),
    ];
    if let Some(kw) = search {
        if !kw.trim().is_empty() {
            q.push(("search", kw));
        }
    }
    let resp = c.get(&format!("/oapi/v1/codeup/organizations/{org}/repositories"), &q).await?;
    let items: Vec<Value> = as_array(&resp)
        .iter()
        .map(|r| {
            json!({
                "id": i64_of(r, "id").unwrap_or(0),
                "name": s(r, "name"),
                "pathWithNamespace": s2(r, "pathWithNamespace", "path_with_namespace"),
                "lastActivityAt": s2(r, "lastActivityAt", "last_activity_at"),
            })
        })
        .filter(|r| r["id"].as_i64().unwrap_or(0) > 0)
        .collect();
    Ok(Value::Array(items))
}

#[tauri::command]
pub async fn list_branches(state: State<'_, AppState>, repo_id: i64, search: Option<String>) -> Result<Value, String> {
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    let mut q = vec![
        ("page", "1".to_string()),
        ("perPage", "100".to_string()),
    ];
    if let Some(kw) = search {
        if !kw.trim().is_empty() {
            q.push(("search", kw));
        }
    }
    c.get(&format!("/oapi/v1/codeup/organizations/{org}/repositories/{repo_id}/branches"), &q).await
}

/// POST branches?branch=&ref=（参数在 query）
#[tauri::command]
pub async fn create_branch(state: State<'_, AppState>, repo_id: i64, branch_name: String, ref_name: String) -> Result<Value, String> {
    ensure_write(&state)?;
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    c.post(
        &format!("/oapi/v1/codeup/organizations/{org}/repositories/{repo_id}/branches"),
        &[("branch", branch_name), ("ref", ref_name)],
        json!({}),
    )
    .await
}

#[tauri::command]
pub async fn list_repository_commits(state: State<'_, AppState>, repo_id: i64, page: Option<i64>) -> Result<Value, String> {
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    let q = vec![
        ("page", page.unwrap_or(1).to_string()),
        ("perPage", "50".to_string()),
    ];
    c.get(&format!("/oapi/v1/codeup/organizations/{org}/repositories/{repo_id}/commits"), &q).await
}

// ---------- MR（oapi 里叫 changeRequests）----------

/// 组织级列表，projectIds 过滤到本仓库
#[tauri::command]
pub async fn list_merge_requests(state: State<'_, AppState>, repo_id: i64, state_filter: Option<String>) -> Result<Value, String> {
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    let mut q = vec![
        ("page", "1".to_string()),
        ("perPage", "50".to_string()),
        ("projectIds", repo_id.to_string()),
    ];
    if let Some(st) = state_filter {
        if !st.is_empty() {
            q.push(("state", st));
        }
    }
    c.get(&format!("/oapi/v1/codeup/organizations/{org}/changeRequests"), &q).await
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
        "sourceProjectId": repo_id.to_string(),
        "targetProjectId": repo_id.to_string(),
    });
    if let Some(d) = description {
        body["description"] = json!(d);
    }
    c.post(
        &format!("/oapi/v1/codeup/organizations/{org}/repositories/{repo_id}/changeRequests"),
        &[],
        body,
    )
    .await
}

#[tauri::command]
pub async fn merge_merge_request(state: State<'_, AppState>, repo_id: i64, local_id: i64) -> Result<Value, String> {
    ensure_write(&state)?;
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    c.post(
        &format!("/oapi/v1/codeup/organizations/{org}/repositories/{repo_id}/changeRequests/{local_id}/merge"),
        &[],
        json!({ "mergeType": "no-fast-forward" }),
    )
    .await
}

// ---------- 流水线 ----------

#[tauri::command]
pub async fn list_pipelines(state: State<'_, AppState>, max_results: Option<i64>) -> Result<Value, String> {
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    let q = vec![
        ("page", "1".to_string()),
        ("perPage", max_results.unwrap_or(20).to_string()),
    ];
    let resp = c.get(&format!("/oapi/v1/flow/organizations/{org}/pipelines"), &q).await?;
    let items: Vec<Value> = as_array(&resp)
        .iter()
        .map(|p| {
            json!({
                "pipelineId": i64_of(p, "id").unwrap_or(0).max(i64_of(p, "pipelineId").unwrap_or(0)),
                "pipelineName": s2(p, "name", "pipelineName"),
                "status": nested_s(p, "latestRun", "status"),
                "updateTime": s(p, "updateTime"),
            })
        })
        .filter(|p| p["pipelineId"].as_i64().unwrap_or(0) > 0)
        .collect();
    Ok(Value::Array(items))
}

#[tauri::command]
pub async fn list_pipeline_runs(state: State<'_, AppState>, pipeline_id: i64, max_results: Option<i64>) -> Result<Value, String> {
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    let q = vec![
        ("page", "1".to_string()),
        ("perPage", max_results.unwrap_or(5).to_string()),
    ];
    let resp = c
        .get(&format!("/oapi/v1/flow/organizations/{org}/pipelines/{pipeline_id}/runs"), &q)
        .await?;
    let items: Vec<Value> = as_array(&resp)
        .iter()
        .map(|r| {
            json!({
                "pipelineRunId": i64_of(r, "pipelineRunId").unwrap_or(0),
                "status": s(r, "status"),
                "startTime": i64_of(r, "createTime"),
                "endTime": i64_of(r, "updateTime"),
                "executorAccountId": s(r, "creatorAccountId"),
                "triggerMode": i64_of(r, "triggerMode"),
            })
        })
        .filter(|r| r["pipelineRunId"].as_i64().unwrap_or(0) > 0)
        .collect();
    Ok(Value::Array(items))
}

#[tauri::command]
pub async fn get_pipeline_run(state: State<'_, AppState>, pipeline_id: i64, run_id: i64) -> Result<Value, String> {
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    c.get(&format!("/oapi/v1/flow/organizations/{org}/pipelines/{pipeline_id}/runs/{run_id}"), &[]).await
}

/// POST runs body {params:{}} → 运行 ID
#[tauri::command]
pub async fn start_pipeline_run(state: State<'_, AppState>, pipeline_id: i64) -> Result<Value, String> {
    ensure_write(&state)?;
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    c.post(
        &format!("/oapi/v1/flow/organizations/{org}/pipelines/{pipeline_id}/runs"),
        &[],
        json!({ "params": {} }),
    )
    .await
}

/// oapi/v1 PAT 面未提供运行级停止端点（只有 deploy/job 级），明确报不支持
#[tauri::command]
pub async fn stop_pipeline_run(_pipeline_id: i64, _run_id: i64) -> Result<Value, String> {
    Err("UNSUPPORTED: 当前 oapi/v1 接口不支持停止整条运行（可在云效网页操作）".into())
}

#[tauri::command]
pub async fn get_job_logs(state: State<'_, AppState>, pipeline_id: i64, run_id: i64, job_id: i64) -> Result<String, String> {
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    let resp = c
        .get(
            &format!("/oapi/v1/flow/organizations/{org}/pipelines/{pipeline_id}/runs/{run_id}/job/{job_id}/log"),
            &[],
        )
        .await?;
    // 响应结构以联调为准：数组逐行、或 {logs:[]}、或整体 JSON
    if let Some(arr) = resp.as_array() {
        let mut out = String::new();
        for line in arr {
            if let Some(t) = line.as_str() {
                out.push_str(t);
                out.push('\n');
            } else {
                out.push_str(&serde_json::to_string_pretty(line).unwrap_or_default());
                out.push('\n');
            }
        }
        return Ok(out);
    }
    if let Some(arr) = resp.get("logs").and_then(|x| x.as_array()) {
        let mut out = String::new();
        for line in arr {
            out.push_str(&line.as_str().unwrap_or_default());
            out.push('\n');
        }
        return Ok(out);
    }
    Ok(serde_json::to_string_pretty(&resp).unwrap_or_default())
}
