use super::common::{as_array, client_of, org_of, s};
use crate::credentials::{self, RepoCiBinding, Settings};
use crate::{db, AppState};
use serde_json::{json, Value};
use std::collections::HashMap;
use tauri::State;

// ---------- 凭证与设置 ----------

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<Value, String> {
    let st = {
        let conn = state.db.lock().unwrap();
        db::load_settings(&conn)?
    };
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

/// 重建云效客户端并刷新设置镜像。
/// 阶段3 起设置事实源是 nervd.db：common::rebuild 内部的 settings.json 重载在一次性迁移后
/// 恒为默认值，这里在其执行后立即以 db 组装结果覆盖镜像，保留其客户端重建职责。
fn rebuild(state: &State<'_, AppState>, app: &tauri::AppHandle) {
    super::common::rebuild(state, app);
    let fresh = {
        let conn = state.db.lock().unwrap();
        db::load_settings(&conn)
    };
    match fresh {
        Ok(fresh) => *state.settings.lock().unwrap() = fresh,
        Err(e) => eprintln!("[settings] 从 nervd.db 刷新设置镜像失败: {e}"),
    }
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
                ..
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

fn trim_templates(templates: &mut [credentials::BranchRuleTemplate]) {
    for template in templates.iter_mut() {
        template.id = template.id.trim().to_string();
        template.name = template.name.trim().to_string();
        template.source_branch = template.source_branch.trim().to_string();
        template.baseline_branch_pattern = template.baseline_branch_pattern.trim().to_string();
        template.workitem_branch_pattern = template.workitem_branch_pattern.trim().to_string();
    }
}

/// 刷新内存设置镜像（写命令落库后调用，保证 ci/poller 等镜像消费方立即看到最新值）
fn refresh_mirror(state: &State<'_, AppState>, fresh: Settings) {
    *state.settings.lock().unwrap() = fresh;
}

#[tauri::command]
pub async fn save_settings(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    settings: Settings,
) -> Result<Value, String> {
    validate_settings(&settings)?;
    // A1 根治点：设置草稿的全量写不得回滚行级轨道/绑定数据 —— 这两类字段显式忽略
    if !settings.branch_rule_templates.is_empty()
        || !settings.workitem_repo_branch_templates.is_empty()
    {
        eprintln!(
            "[settings] save_settings 忽略 branchRuleTemplates / workitemRepoBranchTemplates 草稿字段；\
             行级数据请使用 save_branch_rule_templates / save_iteration_tracks / save_workitem_repo_branch_template"
        );
    }
    let fresh = {
        let conn = state.db.lock().unwrap();
        db::upsert_plain_settings(&conn, &settings)?;
        db::load_settings(&conn)?
    };
    refresh_mirror(&state, fresh);
    rebuild(&state, &app);
    get_settings(state).await
}

#[tauri::command]
pub async fn save_workitem_repos(
    state: State<'_, AppState>,
    workitem_id: String,
    repo_ids: Option<Vec<i64>>,
) -> Result<Value, String> {
    if workitem_id.trim().is_empty() {
        return Err("需求 ID 不能为空".into());
    }
    let fresh = {
        let conn = state.db.lock().unwrap();
        let mut current = db::load_settings(&conn)?;
        if let Some(mut ids) = repo_ids {
            if ids.iter().any(|id| *id <= 0) {
                return Err("仓库 ID 无效".into());
            }
            ids.sort_unstable();
            ids.dedup();
            // 解除关联的仓库同步清掉其分支模板绑定
            db::delete_workitem_bindings(&conn, &workitem_id, Some(&ids))?;
            current.workitem_repos.insert(workitem_id, ids);
        } else {
            db::delete_workitem_bindings(&conn, &workitem_id, None)?;
            current.workitem_repos.remove(&workitem_id);
        }
        db::upsert_app_setting(
            &conn,
            "workitemRepos",
            &serde_json::to_string(&current.workitem_repos).map_err(|e| e.to_string())?,
        )?;
        current
    };
    refresh_mirror(&state, fresh);
    get_settings(state).await
}

#[tauri::command]
pub async fn save_branch_rule_templates(
    state: State<'_, AppState>,
    mut templates: Vec<credentials::BranchRuleTemplate>,
) -> Result<Value, String> {
    trim_templates(&mut templates);
    validate_branch_rule_templates(&templates)?;
    let fresh = {
        let mut conn = state.db.lock().unwrap();
        db::replace_global_tracks(&mut conn, &templates)?;
        db::load_settings(&conn)?
    };
    refresh_mirror(&state, fresh);
    get_settings(state).await
}

#[tauri::command]
pub async fn save_workitem_repo_branch_template(
    state: State<'_, AppState>,
    workitem_id: String,
    repo_id: i64,
    template_id: Option<String>,
) -> Result<Value, String> {
    let workitem_id = workitem_id.trim().to_string();
    if workitem_id.is_empty() || repo_id <= 0 {
        return Err("需求 ID 或仓库 ID 无效".into());
    }
    let fresh = {
        let conn = state.db.lock().unwrap();
        if let Some(template_id) = template_id.map(|value| value.trim().to_string()) {
            if template_id.is_empty() || template_id.len() > 100 {
                return Err("分支模板 ID 无效".into());
            }
            // 允许全局模板及当前迭代专属模板（阶段3 起统一存于 branch_tracks，须真实存在）
            if !db::track_exists(&conn, &template_id)? {
                return Err(format!("分支模板 {template_id} 不存在"));
            }
            db::upsert_binding(&conn, &workitem_id, repo_id, Some(&template_id))?;
        } else {
            db::delete_binding(&conn, &workitem_id, repo_id)?;
        }
        db::load_settings(&conn)?
    };
    refresh_mirror(&state, fresh);
    get_settings(state).await
}

/// 行级替换某迭代的专属分支轨道（重名校验仅限同一 scope+iteration 内：
/// 列表即该迭代的全量集合，validate_branch_rule_templates 的列表内去重即等价于同 scope 去重）
#[tauri::command]
pub async fn save_iteration_tracks(
    state: State<'_, AppState>,
    iteration_id: String,
    mut templates: Vec<credentials::BranchRuleTemplate>,
) -> Result<Value, String> {
    let iteration_id = iteration_id.trim().to_string();
    if iteration_id.is_empty() {
        return Err("迭代 ID 不能为空".into());
    }
    trim_templates(&mut templates);
    validate_branch_rule_templates(&templates)?;
    {
        let mut conn = state.db.lock().unwrap();
        db::replace_iteration_tracks(&mut conn, &iteration_id, &templates)?;
    }
    get_settings(state).await
}

/// 读取某迭代的专属分支轨道（ORDER BY sort_order）
#[tauri::command]
pub async fn list_iteration_tracks(
    state: State<'_, AppState>,
    iteration_id: String,
) -> Result<Vec<credentials::BranchRuleTemplate>, String> {
    let iteration_id = iteration_id.trim().to_string();
    if iteration_id.is_empty() {
        return Err("迭代 ID 不能为空".into());
    }
    let conn = state.db.lock().unwrap();
    db::iteration_tracks(&conn, &iteration_id)
}

/// 迭代专属分支模板：遗留 localStorage 数据一次性幂等导入
/// （app_settings 键 localStorageImported=1 后直接返回 Ok(true)）
#[tauri::command]
pub async fn import_iteration_tracks(
    state: State<'_, AppState>,
    map: HashMap<String, Vec<credentials::BranchRuleTemplate>>,
) -> Result<bool, String> {
    {
        let mut conn = state.db.lock().unwrap();
        if db::local_storage_imported(&conn)? {
            return Ok(true);
        }
        let mut entries: Vec<(&String, &Vec<credentials::BranchRuleTemplate>)> =
            map.iter().collect();
        entries.sort_by(|a, b| a.0.cmp(b.0)); // 确定性顺序，便于定位失败键
        for (raw_iteration_id, templates) in entries {
            let iteration_id = raw_iteration_id.trim();
            if iteration_id.is_empty() {
                return Err("迭代 ID 不能为空".into());
            }
            let mut templates = templates.clone();
            trim_templates(&mut templates);
            validate_branch_rule_templates(&templates)?;
            db::replace_iteration_tracks(&mut conn, iteration_id, &templates)?;
        }
        db::mark_local_storage_imported(&conn)?;
    }
    Ok(true)
}

#[tauri::command]
pub async fn save_repo_ci_binding(
    state: State<'_, AppState>,
    repo_id: i64,
    binding: Option<RepoCiBinding>,
) -> Result<Value, String> {
    if repo_id <= 0 {
        return Err("仓库 ID 无效".into());
    }
    let fresh = {
        let conn = state.db.lock().unwrap();
        let mut current = db::load_settings(&conn)?;
        if let Some(binding) = binding {
            let binding = match binding {
                RepoCiBinding::Jenkins {
                    connection_id,
                    job_full_name,
                    mut parameters,
                    environment_parameter,
                    branch_parameter,
                } => {
                    if !current.jenkins_connections.iter().any(|item| item.id == connection_id)
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
            current.repo_ci_bindings.insert(repo_id, binding);
        } else {
            current.repo_ci_bindings.remove(&repo_id);
        }
        db::upsert_app_setting(
            &conn,
            "repoCiBindings",
            &serde_json::to_string(&current.repo_ci_bindings).map_err(|e| e.to_string())?,
        )?;
        current
    };
    refresh_mirror(&state, fresh);
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

    #[test]
    fn test_validate_branch_rule_templates_dedupes_within_single_scope() {
        // 同一迭代（同一列表）内重名/重 ID 应被拒绝；校验语义 = save_iteration_tracks 的 scope+iteration 内去重
        let templates = vec![
            credentials::BranchRuleTemplate {
                id: "iter-a".into(),
                name: "同名".into(),
                source_branch: "master".into(),
                baseline_branch_pattern: "iteration/{iteration}".into(),
                workitem_branch_pattern: "feature/{identifier}".into(),
            },
            credentials::BranchRuleTemplate {
                id: "iter-b".into(),
                name: "同名".into(),
                source_branch: "master".into(),
                baseline_branch_pattern: "iteration/{iteration}".into(),
                workitem_branch_pattern: "feature/{identifier}".into(),
            },
        ];
        assert!(validate_branch_rule_templates(&templates).is_err());
    }
}
