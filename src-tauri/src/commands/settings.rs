use super::common::{as_array, client_of, org_of, rebuild, s};
use crate::credentials::{self, Settings};
use crate::AppState;
use serde_json::{json, Value};
use tauri::State;

// ---------- 凭证与设置 ----------

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<Value, String> {
    let st = state.settings.lock().unwrap().clone();
    let mut v = serde_json::to_value(&st).map_err(|e| e.to_string())?;
    if let Some(map) = v.as_object_mut() {
        map.insert("hasPat".into(), json!(credentials::load_pat().is_some()));
        if let Some(connections) = map
            .get_mut("jenkinsConnections")
            .and_then(Value::as_array_mut)
        {
            for connection in connections {
                let has_token = connection
                    .get("id")
                    .and_then(Value::as_str)
                    .map(credentials::has_jenkins_token)
                    .unwrap_or(false);
                if let Some(fields) = connection.as_object_mut() {
                    fields.insert("hasToken".into(), json!(has_token));
                }
            }
        }
    }
    Ok(v)
}

fn validate_settings(settings: &Settings) -> Result<(), String> {
    let mut connection_ids = std::collections::HashSet::new();
    for connection in &settings.jenkins_connections {
        if connection.id.trim().is_empty()
            || connection.id.len() > 80
            || !connection
                .id
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
            || connection.name.trim().is_empty()
            || connection.base_url.trim().is_empty()
            || connection.username.trim().is_empty()
        {
            return Err("Jenkins 实例需要填写名称、地址和用户名".into());
        }
        if !connection_ids.insert(connection.id.as_str()) {
            return Err(format!("Jenkins 实例 ID 重复: {}", connection.id));
        }
    }
    for (repo_id, binding) in &settings.repo_ci_bindings {
        if *repo_id <= 0 {
            return Err("CI 绑定中的仓库 ID 无效".into());
        }
        match binding {
            credentials::RepoCiBinding::Flow {
                pipeline_id,
                pipeline_name,
            } => {
                if *pipeline_id <= 0 || pipeline_name.trim().is_empty() {
                    return Err(format!("仓库 #{repo_id} 的云效流水线绑定无效"));
                }
            }
            credentials::RepoCiBinding::Jenkins {
                connection_id,
                job_full_name,
            } => {
                if !connection_ids.contains(connection_id.as_str())
                    || job_full_name.trim().is_empty()
                {
                    return Err(format!("仓库 #{repo_id} 的 Jenkins Job 绑定无效"));
                }
            }
        }
    }
    for (workitem_id, repos) in &settings.workitem_repos {
        if workitem_id.trim().is_empty() || repos.iter().any(|repo_id| *repo_id <= 0) {
            return Err("需求仓库关联数据无效".into());
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn save_settings(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    settings: Settings,
) -> Result<Value, String> {
    validate_settings(&settings)?;
    credentials::save_settings(&app, &settings)?;
    rebuild(&state, &app);
    get_settings(state).await
}

#[tauri::command]
pub async fn save_workitem_repos(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    workitem_id: String,
    repo_ids: Option<Vec<i64>>,
) -> Result<Value, String> {
    if workitem_id.trim().is_empty() {
        return Err("需求 ID 不能为空".into());
    }
    let mut settings = state.settings.lock().unwrap().clone();
    if let Some(mut ids) = repo_ids {
        if ids.iter().any(|id| *id <= 0) {
            return Err("仓库 ID 无效".into());
        }
        ids.sort_unstable();
        ids.dedup();
        settings.workitem_repos.insert(workitem_id, ids);
    } else {
        settings.workitem_repos.remove(&workitem_id);
    }
    credentials::save_settings(&app, &settings)?;
    *state.settings.lock().unwrap() = settings;
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
pub async fn list_projects(
    state: State<'_, AppState>,
    search: Option<String>,
) -> Result<Value, String> {
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    let mut body = json!({ "page": 1, "perPage": 50 });
    if let Some(kw) = search {
        if !kw.trim().is_empty() {
            body["name"] = json!(kw);
        }
    }
    let resp = c
        .post(
            &format!("/oapi/v1/projex/organizations/{org}/projects:search"),
            &[],
            body,
        )
        .await?;
    let items: Vec<Value> = as_array(&resp)
        .iter()
        .map(|p| {
            let id = {
                let a = s(p, "identifier");
                if a.is_empty() {
                    s(p, "id")
                } else {
                    a
                }
            };
            json!({
                "id": id,
                "name": s(p, "name"),
            })
        })
        .collect();
    Ok(Value::Array(items))
}
