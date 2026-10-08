use super::common::{as_array, client_of, ensure_write, i64_of, org_of, s, s2};
use crate::AppState;
use serde_json::{json, Value};
use tauri::State;

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

