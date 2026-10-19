use super::common::{as_array, client_of, org_of, rebuild, s};
use crate::credentials::{self, RepoCiBinding, Settings};
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
                ..
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
    validate_branch_rule_templates(&settings.branch_rule_templates)?;
    for (workitem_id, repos) in &settings.workitem_repo_branch_templates {
        if workitem_id.trim().is_empty()
            || repos.iter().any(|(repo_id, template_id)| {
                *repo_id <= 0 || template_id.trim().is_empty() || template_id.len() > 100
            })
        {
            return Err("需求仓库的分支模板关联无效".into());
        }
    }
    Ok(())
}

fn validate_branch_rule_templates(templates: &[credentials::BranchRuleTemplate]) -> Result<(), String> {
    let mut ids = std::collections::HashSet::new();
    let mut names = std::collections::HashSet::new();
    for template in templates {
        let id = template.id.trim();
        let name = template.name.trim();
        if id.is_empty() || id.len() > 100 || name.is_empty() || name.len() > 100 {
            return Err("分支模板需要有效的 ID 和名称".into());
        }
        if !ids.insert(id) || !names.insert(name.to_lowercase()) {
            return Err("分支模板 ID 和名称不能重复".into());
        }
        for (label, value) in [
            ("来源分支", template.source_branch.as_str()),
            ("迭代基准分支模板", template.baseline_branch_pattern.as_str()),
            ("需求分支模板", template.workitem_branch_pattern.as_str()),
        ] {
            let value = value.trim();
            if value.is_empty()
                || value.len() > 255
                || value.chars().any(|character| {
                    character.is_control() || character.is_whitespace() || "~^:?*[\\".contains(character)
                })
            {
                return Err(format!("分支模板的{label}无效"));
            }
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
        if let Some(templates) = settings.workitem_repo_branch_templates.get_mut(&workitem_id) {
            templates.retain(|repo_id, _| ids.contains(repo_id));
            if templates.is_empty() {
                settings.workitem_repo_branch_templates.remove(&workitem_id);
            }
        }
        settings.workitem_repos.insert(workitem_id, ids);
    } else {
        settings.workitem_repos.remove(&workitem_id);
        settings.workitem_repo_branch_templates.remove(&workitem_id);
    }
    credentials::save_settings(&app, &settings)?;
    *state.settings.lock().unwrap() = settings;
    get_settings(state).await
}

#[tauri::command]
pub async fn save_branch_rule_templates(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    mut templates: Vec<credentials::BranchRuleTemplate>,
) -> Result<Value, String> {
    for template in &mut templates {
        template.id = template.id.trim().to_string();
        template.name = template.name.trim().to_string();
        template.source_branch = template.source_branch.trim().to_string();
        template.baseline_branch_pattern = template.baseline_branch_pattern.trim().to_string();
        template.workitem_branch_pattern = template.workitem_branch_pattern.trim().to_string();
    }
    validate_branch_rule_templates(&templates)?;
    let mut settings = state.settings.lock().unwrap().clone();
    let old_template_ids: std::collections::HashSet<String> = settings
        .branch_rule_templates
        .iter()
        .map(|template| template.id.clone())
        .collect();
    let new_template_ids: std::collections::HashSet<String> = templates
        .iter()
        .map(|template| template.id.clone())
        .collect();
    settings.branch_rule_templates = templates;
    // 仅清理在旧全局模板中存在、但在新全局模板中已被删除的 ID；保留迭代专属分支模板的绑定
    settings.workitem_repo_branch_templates.retain(|_, repos| {
        repos.retain(|_, template_id| {
            !old_template_ids.contains(template_id) || new_template_ids.contains(template_id)
        });
        !repos.is_empty()
    });
    credentials::save_settings(&app, &settings)?;
    *state.settings.lock().unwrap() = settings;
    get_settings(state).await
}

#[tauri::command]
pub async fn save_workitem_repo_branch_template(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    workitem_id: String,
    repo_id: i64,
    template_id: Option<String>,
) -> Result<Value, String> {
    let workitem_id = workitem_id.trim().to_string();
    if workitem_id.is_empty() || repo_id <= 0 {
        return Err("需求 ID 或仓库 ID 无效".into());
    }
    let mut settings = state.settings.lock().unwrap().clone();
    if let Some(template_id) = template_id.map(|value| value.trim().to_string()) {
        if template_id.is_empty() || template_id.len() > 100 {
            return Err("分支模板 ID 无效".into());
        }
        // 允许全局模板及当前迭代专属模板（迭代模板由前端按迭代上下文融合并校验），保存映射关系
        settings
            .workitem_repo_branch_templates
            .entry(workitem_id)
            .or_default()
            .insert(repo_id, template_id);
    } else if let Some(repos) = settings.workitem_repo_branch_templates.get_mut(&workitem_id) {
        repos.remove(&repo_id);
        if repos.is_empty() {
            settings.workitem_repo_branch_templates.remove(&workitem_id);
        }
    }
    credentials::save_settings(&app, &settings)?;
    *state.settings.lock().unwrap() = settings;
    get_settings(state).await
}

#[tauri::command]
pub async fn save_repo_ci_binding(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    repo_id: i64,
    binding: Option<RepoCiBinding>,
) -> Result<Value, String> {
    if repo_id <= 0 {
        return Err("仓库 ID 无效".into());
    }
    let mut settings = state.settings.lock().unwrap().clone();
    if let Some(binding) = binding {
        let binding = match binding {
            RepoCiBinding::Jenkins {
                connection_id,
                job_full_name,
                mut parameters,
                environment_parameter,
                branch_parameter,
            } => {
                if !settings.jenkins_connections.iter().any(|item| item.id == connection_id)
                    || job_full_name.trim().is_empty()
                    || job_full_name.len() > 255
                    || parameters.len() > 100
                    || parameters.iter().any(|(name, value)| {
                        name.trim().is_empty()
                            || name.len() > 255
                            || value.len() > 8192
                            || name.chars().any(char::is_control)
                            || value.chars().any(char::is_control)
                    })
                {
                    return Err("Jenkins Job 绑定或构建参数无效".into());
                }
                parameters.retain(|name, _| !name.trim().is_empty());
                RepoCiBinding::Jenkins {
                    connection_id,
                    job_full_name: job_full_name.trim().to_string(),
                    parameters,
                    environment_parameter: environment_parameter
                        .filter(|name| !name.trim().is_empty()),
                    branch_parameter: branch_parameter.filter(|name| !name.trim().is_empty()),
                }
            }
            RepoCiBinding::Flow { .. } => {
                return Err("此操作只保存 Jenkins Job 关联".into());
            }
        };
        settings.repo_ci_bindings.insert(repo_id, binding);
    } else {
        settings.repo_ci_bindings.remove(&repo_id);
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

/// 获取当前登录用户信息（基于 PAT）：GET /oapi/v1/platform/user
#[tauri::command]
pub async fn get_current_user(state: State<'_, AppState>) -> Result<Value, String> {
    let c = client_of(&state)?;
    let resp = c.get("/oapi/v1/platform/user", &[]).await?;
    Ok(json!({
        "id": s(&resp, "id"),
        "name": s(&resp, "name"),
        "email": s(&resp, "email"),
        "avatarUrl": s(&resp, "avatarUrl"),
        "lastOrganization": s(&resp, "lastOrganization"),
    }))
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn test_validate_settings_allows_iteration_scoped_templates() {
        let mut settings = Settings::default();
        let mut repos = HashMap::new();
        // 迭代专属分支模板 ID（不在全局 branch_rule_templates 中）
        repos.insert(12345i64, "iter-template-sprint-99".to_string());
        settings.workitem_repo_branch_templates.insert("REQ-101".to_string(), repos);

        assert!(validate_settings(&settings).is_ok());
    }

    #[test]
    fn test_validate_settings_rejects_invalid_template_id_or_repo_id() {
        let mut settings = Settings::default();
        let mut repos = HashMap::new();
        repos.insert(0i64, "valid-id".to_string());
        settings.workitem_repo_branch_templates.insert("REQ-101".to_string(), repos);
        assert!(validate_settings(&settings).is_err());

        let mut settings = Settings::default();
        let mut repos = HashMap::new();
        repos.insert(123i64, "".to_string());
        settings.workitem_repo_branch_templates.insert("REQ-101".to_string(), repos);
        assert!(validate_settings(&settings).is_err());
    }
}
