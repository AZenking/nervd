use super::common::{as_array, client_of, ensure_write, fetch_all_codeup_pages, i64_of, org_of, s, s2};
use crate::AppState;
use serde_json::{json, Value};
use tauri::State;

// ---------- 仓库 / 分支 / commit ----------

#[tauri::command]
pub async fn list_repos(state: State<'_, AppState>, search: Option<String>, page: Option<i64>) -> Result<Value, String> {
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    let mut base_q = Vec::new();
    if let Some(kw) = search {
        let kw = kw.trim();
        if !kw.is_empty() {
            base_q.push(("search", kw.to_string()));
        }
    }
    let path = format!("/oapi/v1/codeup/organizations/{org}/repositories");
    let items_raw = match page {
        Some(p) => {
            let mut q = base_q;
            q.push(("page", p.max(1).to_string()));
            q.push(("perPage", "100".to_string()));
            let resp = c.get(&path, &q).await?;
            as_array(&resp)
        }
        None => {
            // 未指定单页时自动多页递归聚合，取全组织仓库（上限 2000 个）
            fetch_all_codeup_pages(&c, &path, &base_q, 2000).await?
        }
    };
    let items: Vec<Value> = items_raw
        .iter()
        .map(|r| {
            json!({
                "id": i64_of(r, "id").unwrap_or(0),
                "name": s(r, "name"),
                "pathWithNamespace": s2(r, "pathWithNamespace", "path_with_namespace"),
                "lastActivityAt": s2(r, "lastActivityAt", "last_activity_at"),
                "archived": r.get("archived").and_then(|v| v.as_bool()).unwrap_or(false),
            })
        })
        .filter(|r| r["id"].as_i64().unwrap_or(0) > 0)
        .collect();
    Ok(Value::Array(items))
}

#[tauri::command]
pub async fn list_branches(
    state: State<'_, AppState>,
    repo_id: i64,
    search: Option<String>,
    page: Option<i64>,
    per_page: Option<i64>,
) -> Result<Value, String> {
    if repo_id <= 0 {
        return Err("仓库 ID 无效".into());
    }
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    let mut base_q = Vec::new();
    if let Some(kw) = search {
        let kw = kw.trim();
        if !kw.is_empty() {
            base_q.push(("search", kw.to_string()));
        }
    }
    let path = format!("/oapi/v1/codeup/organizations/{org}/repositories/{repo_id}/branches");
    match page {
        Some(p) => {
            let page = p.max(1);
            let per_page = per_page.unwrap_or(100).clamp(1, 100);
            let mut q = base_q;
            q.push(("page", page.to_string()));
            q.push(("perPage", per_page.to_string()));
            c.get(&path, &q).await
        }
        None => {
            let all = fetch_all_codeup_pages(&c, &path, &base_q, 2000).await?;
            Ok(Value::Array(all))
        }
    }
}

#[tauri::command]
pub async fn compare_branches(
    state: State<'_, AppState>,
    repo_id: i64,
    from_branch: String,
    to_branch: String,
) -> Result<Value, String> {
    if repo_id <= 0 {
        return Err("仓库 ID 无效".into());
    }
    let from_branch = from_branch.trim();
    let to_branch = to_branch.trim();
    if from_branch.is_empty() || to_branch.is_empty() {
        return Err("比较分支不能为空".into());
    }
    if from_branch == to_branch {
        return Err("比较分支不能相同".into());
    }
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    let q = vec![
        ("from", from_branch.to_string()),
        ("to", to_branch.to_string()),
        ("sourceType", "branch".to_string()),
        ("targetType", "branch".to_string()),
        ("straight", "false".to_string()),
    ];
    c.get(
        &format!("/oapi/v1/codeup/organizations/{org}/repositories/{repo_id}/compares"),
        &q,
    )
    .await
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
        ("perPage", "100".to_string()),
    ];
    c.get(&format!("/oapi/v1/codeup/organizations/{org}/repositories/{repo_id}/commits"), &q).await
}

// ---------- MR（oapi 里叫 changeRequests）----------

/// 组织级列表，projectIds 过滤到本仓库，使用统一分页收集器自动取全
#[tauri::command]
pub async fn list_merge_requests(state: State<'_, AppState>, repo_id: i64, state_filter: Option<String>) -> Result<Value, String> {
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    let mut base_q = vec![
        ("projectIds", repo_id.to_string()),
    ];
    if let Some(st) = state_filter {
        let st = st.trim();
        if !st.is_empty() {
            base_q.push(("state", st.to_string()));
        }
    }
    let path = format!("/oapi/v1/codeup/organizations/{org}/changeRequests");
    let all = fetch_all_codeup_pages(&c, &path, &base_q, 1000).await?;
    Ok(Value::Array(all))
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
