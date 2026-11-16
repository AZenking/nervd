//! 本地仓库命令层：绑定管理、git 只读探测、本地提交同步、active workitem、
//! commit-msg 钩子与目录选择。
//!
//! 具体 git / 文件 / SQLite 逻辑在 `crate::local_repo`；本文件只做参数校验、
//! 云效工作项解析与 Tauri 状态编排。

use crate::attribution::model::{
    ActiveWorkitem, HookStatus, LocalRepoBinding, LocalRepoInfo, SyncReport,
};
use crate::local_repo as lr;
use crate::yunxiao::YunxiaoClient;
use crate::AppState;
use serde_json::Value;
use std::sync::Arc;
use tauri::State;
use tauri_plugin_dialog::DialogExt;

use super::common::ensure_write;

fn db(state: &AppState) -> Result<std::sync::MutexGuard<'_, rusqlite::Connection>, String> {
    state
        .db
        .lock()
        .map_err(|_| "数据库锁不可用，请重启 nervd".to_string())
}

// ---------------------------------------------------------------------------
// 绑定
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn list_local_repo_bindings(
    state: State<'_, AppState>,
) -> Result<Vec<LocalRepoBinding>, String> {
    let conn = db(state.inner())?;
    lr::list_local_repo_bindings(&conn)
}

/// 打开系统文件夹选择器；用户取消返回 `None`。
#[tauri::command]
pub async fn pick_repo_directory(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog().file().pick_folder(move |folder| {
        let _ = tx.send(folder);
    });
    let picked = tauri::async_runtime::spawn_blocking(move || rx.recv().ok().flatten())
        .await
        .map_err(|e| format!("文件夹选择失败: {e}"))?;
    Ok(picked.map(|folder| folder.to_string()))
}

#[tauri::command]
pub async fn inspect_local_repo(path: String) -> Result<LocalRepoInfo, String> {
    if path.trim().is_empty() {
        return Err("本地仓库路径不能为空".into());
    }
    lr::inspect_local_repo(&path)
}

#[tauri::command]
pub async fn save_local_repo_binding(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    repo_id: i64,
    path: String,
) -> Result<LocalRepoBinding, String> {
    if repo_id <= 0 {
        return Err("repo_id 必须大于 0".into());
    }
    if path.trim().is_empty() {
        return Err("本地仓库路径不能为空".into());
    }

    let info = lr::inspect_local_repo(&path)?;
    if !info.is_git {
        return Err(info
            .error
            .unwrap_or_else(|| format!("{} 不是 Git 仓库", info.path)));
    }
    let remote_url = info.remote_url.clone().ok_or_else(|| {
        format!(
            "{} 没有 origin 远程地址；请先执行 git remote add origin <url>",
            info.path
        )
    })?;
    let default_branch = info
        .current_branch
        .clone()
        .or_else(|| lr::origin_default_branch(&info.path));

    let binding = {
        let conn = db(state.inner())?;
        lr::upsert_local_repo_binding(
            &conn,
            repo_id,
            &info.path,
            Some(&remote_url),
            default_branch.as_deref(),
            lr::now_ms(),
        )?
    };

    // 路径可能变化：先丢弃旧 watcher，再按最新绑定重建。
    if let Ok(mut watchers) = state.local_watchers.lock() {
        watchers.remove(&repo_id);
    }
    lr::restore_watchers(&app, state.inner());
    Ok(binding)
}

#[tauri::command]
pub async fn delete_local_repo_binding(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    repo_id: i64,
) -> Result<bool, String> {
    if repo_id <= 0 {
        return Err("repo_id 必须大于 0".into());
    }
    let deleted = {
        let conn = db(state.inner())?;
        lr::delete_local_repo_binding(&conn, repo_id)?
    };
    if let Ok(mut watchers) = state.local_watchers.lock() {
        watchers.remove(&repo_id);
    }
    lr::restore_watchers(&app, state.inner());
    Ok(deleted)
}

#[tauri::command]
pub async fn sync_local_repo(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    repo_id: i64,
) -> Result<SyncReport, String> {
    if repo_id <= 0 {
        return Err("repo_id 必须大于 0".into());
    }
    crate::attribution::sync::sync_repos(state.inner(), Some(vec![repo_id]), false, Some(&app)).await
}

// ---------------------------------------------------------------------------
// active workitem
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn get_active_workitem(
    state: State<'_, AppState>,
    repo_id: Option<i64>,
) -> Result<Option<ActiveWorkitem>, String> {
    if let Some(id) = repo_id {
        if id <= 0 {
            return Err("repo_id 必须大于 0".into());
        }
    }
    // 只在实际读文件前短暂持锁，避免 git/文件 IO 卡住其他命令。
    let binding = {
        let conn = db(state.inner())?;
        match repo_id {
            Some(id) => Some(
                lr::get_local_repo_binding(&conn, id)?
                    .ok_or_else(|| format!("本地仓库未绑定: repo_id={id}"))?,
            ),
            // 未指定仓库时不再猜测「第一个绑定」：多仓库场景下那会读错仓库的上下文。
            // 需要汇总时由前端调用 list_active_workitems。
            None => return Ok(None),
        }
    };
    match binding {
        Some(binding) => lr::read_active_workitem_at(binding.repo_id, &binding.path),
        None => Ok(None),
    }
}

/// 读取本地仓库现有代码上下文（文件树 + 相关文件内容），供 AI 拆解分析。
#[tauri::command]
pub async fn read_local_repo_code(
    state: State<'_, AppState>,
    repo_id: i64,
    ref_name: Option<String>,
    paths: Option<Vec<String>>,
    keywords: Option<Vec<String>>,
) -> Result<Value, String> {
    if repo_id <= 0 {
        return Err("repo_id 必须大于 0".into());
    }
    let binding = {
        let conn = db(state.inner())?;
        lr::get_local_repo_binding(&conn, repo_id)?
            .ok_or_else(|| format!("本地仓库未绑定: repo_id={repo_id}"))?
    };
    lr::read_repo_code_context(
        &binding.path,
        ref_name.as_deref(),
        &paths.unwrap_or_default(),
        &keywords.unwrap_or_default(),
    )
}

/// 汇总所有已绑定仓库的当前工作项（活动状态按仓库记录）。
///
/// 每个仓库读自己工作树根下的 `.nervd/active-workitem.json`；单仓库读取失败
/// （路径失效、非 git）不影响其他仓库。
#[tauri::command]
pub async fn list_active_workitems(
    state: State<'_, AppState>,
) -> Result<Vec<ActiveWorkitem>, String> {
    let bindings = {
        let conn = db(state.inner())?;
        lr::list_local_repo_bindings(&conn)?
    };
    let mut active = Vec::new();
    for binding in bindings {
        if let Ok(Some(item)) = lr::read_active_workitem_at(binding.repo_id, &binding.path) {
            active.push(item);
        }
    }
    active.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    Ok(active)
}

/// 设置/清除当前工作项。
///
/// `workitem_id` 为空表示清除。工作项详情优先从云效 API 解析，失败时回退
/// `workitem_identifiers` 本地缓存；两者都无法解析时不写文件。
#[tauri::command]
pub async fn set_active_workitem(
    state: State<'_, AppState>,
    repo_id: i64,
    workitem_id: Option<String>,
    parent_workitem_id: Option<String>,
) -> Result<bool, String> {
    if repo_id <= 0 {
        return Err("repo_id 必须大于 0".into());
    }
    // 写操作门控：写入 .nervd/active-workitem.json 会改变后续 commit 的 Refs 归属，
    // 与云效写操作同级，只读模式下必须在核心层拒绝（前端门控可被绕过）。
    ensure_write(&state)?;
    let binding = {
        let conn = db(state.inner())?;
        lr::get_local_repo_binding(&conn, repo_id)?
            .ok_or_else(|| format!("本地仓库未绑定: repo_id={repo_id}"))?
    };

    let workitem_id = workitem_id.unwrap_or_default();
    let workitem_id = workitem_id.trim();
    if workitem_id.is_empty() {
        lr::clear_active_workitem(&binding.path)?;
        return Ok(true);
    }
    validate_workitem_id(workitem_id)?;
    let parent = parent_workitem_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    if let Some(parent) = parent {
        validate_workitem_id(parent)?;
    }

    let active = resolve_active_workitem(state.inner(), repo_id, workitem_id, parent).await?;
    lr::write_active_workitem(&binding.path, &active)?;
    Ok(true)
}

fn validate_workitem_id(workitem_id: &str) -> Result<(), String> {
    if workitem_id
        .chars()
        .any(|ch| ch.is_whitespace() || matches!(ch, '/' | '?' | '#'))
    {
        return Err(format!("非法工作项 ID: {workitem_id}"));
    }
    Ok(())
}

fn client_and_org(state: &AppState) -> Result<(Arc<YunxiaoClient>, String), String> {
    let client = state
        .client
        .lock()
        .map_err(|_| "云效客户端锁不可用，请重启 nervd".to_string())?
        .clone()
        .ok_or_else(|| "NOT_CONFIGURED: 请先在设置中保存个人访问令牌".to_string())?;
    let org = state
        .settings
        .lock()
        .map_err(|_| "设置锁不可用，请重启 nervd".to_string())?
        .organization_id
        .trim()
        .to_string();
    if org.is_empty() {
        return Err("NOT_CONFIGURED: 请先在设置中填写组织 ID".into());
    }
    Ok((client, org))
}

fn value_str(value: &Value, keys: &[&str]) -> Option<String> {
    for key in keys {
        let Some(raw) = value.get(*key) else { continue };
        let text = raw
            .as_str()
            .map(ToString::to_string)
            .or_else(|| raw.as_i64().map(|number| number.to_string()));
        if let Some(text) = text {
            let text = text.trim();
            if !text.is_empty() {
                return Some(text.to_string());
            }
        }
    }
    None
}

fn nested_value_str(value: &Value, outer: &str, keys: &[&str]) -> Option<String> {
    value.get(outer).and_then(|inner| value_str(inner, keys))
}

/// `GET workitems/{id}` 的响应顶层即工作项对象；防御式兼容 `workitem` / `data` 包装。
fn detail_row(response: &Value) -> &Value {
    for key in ["workitem", "data"] {
        if let Some(inner) = response.get(key) {
            if inner.is_object() && (inner.get("id").is_some() || inner.get("identifier").is_some())
            {
                return inner;
            }
        }
    }
    response
}

fn parent_refs(row: &Value) -> (Option<String>, Option<String>) {
    let direct_id = value_str(row, &["parentId"]);
    let direct_identifier = value_str(row, &["parentIdentifier"]);
    match row.get("parent") {
        Some(Value::String(id)) => {
            let id = id.trim();
            (
                if id.is_empty() {
                    direct_id
                } else {
                    Some(id.to_string())
                },
                direct_identifier,
            )
        }
        Some(parent) => (
            value_str(parent, &["id", "workitemId"]).or(direct_id),
            value_str(parent, &["identifier", "serialNumber"]).or(direct_identifier),
        ),
        None => (direct_id, direct_identifier),
    }
}

async fn fetch_workitem(
    client: &YunxiaoClient,
    org: &str,
    workitem_id: &str,
) -> Result<Value, String> {
    client
        .get(
            &format!("/oapi/v1/projex/organizations/{org}/workitems/{workitem_id}"),
            &[],
        )
        .await
}

async fn resolve_active_workitem(
    state: &AppState,
    repo_id: i64,
    workitem_id: &str,
    explicit_parent: Option<&str>,
) -> Result<ActiveWorkitem, String> {
    match resolve_from_api(state, repo_id, workitem_id, explicit_parent).await {
        Ok(active) => Ok(active),
        Err(api_error) => {
            let cached = {
                let conn = db(state)?;
                lr::cached_workitem_context(&conn, repo_id, workitem_id)?
            };
            match cached {
                Some(mut active) => {
                    if let Some(parent) = explicit_parent {
                        active.parent_workitem_id = Some(parent.to_string());
                    }
                    Ok(active)
                }
                None => Err(api_error),
            }
        }
    }
}

async fn resolve_from_api(
    state: &AppState,
    repo_id: i64,
    workitem_id: &str,
    explicit_parent: Option<&str>,
) -> Result<ActiveWorkitem, String> {
    let (client, org) = client_and_org(state)?;
    let detail = fetch_workitem(&client, &org, workitem_id).await?;
    let row = detail_row(&detail);

    let identifier = value_str(row, &["identifier", "serialNumber"]).ok_or_else(|| {
        format!("工作项 {workitem_id} 详情缺少 identifier（serialNumber），无法写入 Refs")
    })?;
    let category_raw = value_str(row, &["categoryId", "category"])
        .or_else(|| nested_value_str(row, "workitemType", &["categoryId", "category"]))
        .unwrap_or_else(|| "Req".to_string());
    let category = lr::normalize_category_hint(&category_raw, &identifier);

    let (detail_parent_id, detail_parent_identifier) = parent_refs(row);
    let parent_id = explicit_parent
        .map(ToString::to_string)
        .or_else(|| detail_parent_id.clone());
    let mut parent_identifier = if parent_id == detail_parent_id {
        detail_parent_identifier
    } else {
        None
    };
    if parent_identifier.is_none() {
        if let Some(parent_id) = parent_id.clone() {
            let parent_detail = fetch_workitem(&client, &org, &parent_id)
                .await
                .map_err(|e| format!("无法解析父工作项 {parent_id}: {e}"))?;
            let parent_row = detail_row(&parent_detail);
            let resolved = value_str(parent_row, &["identifier", "serialNumber"])
                .ok_or_else(|| format!("父工作项 {parent_id} 详情缺少 identifier"))?;
            parent_identifier = Some(resolved);
        }
    }

    Ok(ActiveWorkitem {
        repo_id,
        workitem_id: workitem_id.to_string(),
        identifier,
        category,
        parent_workitem_id: parent_id,
        parent_identifier,
        updated_at: lr::now_ms(),
    })
}

// ---------------------------------------------------------------------------
// commit-msg 钩子
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn install_commit_msg_hook(
    state: State<'_, AppState>,
    repo_id: i64,
    mode: Option<String>,
) -> Result<HookStatus, String> {
    if repo_id <= 0 {
        return Err("repo_id 必须大于 0".into());
    }
    let mode = lr::normalize_hook_mode(mode.as_deref())?;
    let binding = {
        let conn = db(state.inner())?;
        lr::get_local_repo_binding(&conn, repo_id)?
            .ok_or_else(|| format!("本地仓库未绑定: repo_id={repo_id}"))?
    };
    let status = lr::install_commit_msg_hook(&binding.path, &mode)?;
    {
        let conn = db(state.inner())?;
        lr::set_local_repo_hook_state(&conn, repo_id, true, &mode, lr::now_ms())?;
    }
    Ok(status)
}

#[tauri::command]
pub async fn uninstall_commit_msg_hook(
    state: State<'_, AppState>,
    repo_id: i64,
) -> Result<HookStatus, String> {
    if repo_id <= 0 {
        return Err("repo_id 必须大于 0".into());
    }
    let binding = {
        let conn = db(state.inner())?;
        lr::get_local_repo_binding(&conn, repo_id)?
            .ok_or_else(|| format!("本地仓库未绑定: repo_id={repo_id}"))?
    };
    let status = lr::uninstall_commit_msg_hook(&binding.path)?;
    {
        let conn = db(state.inner())?;
        lr::set_local_repo_hook_state(&conn, repo_id, false, "off", lr::now_ms())?;
    }
    Ok(status)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn detail_row_unwraps_known_envelopes() {
        let bare = json!({ "id": "a", "identifier": "REQ-1" });
        assert_eq!(
            value_str(detail_row(&bare), &["identifier"]).as_deref(),
            Some("REQ-1")
        );

        let wrapped = json!({ "workitem": { "id": "a", "serialNumber": "TASK-2" } });
        assert_eq!(
            value_str(detail_row(&wrapped), &["identifier", "serialNumber"]).as_deref(),
            Some("TASK-2")
        );
    }

    #[test]
    fn parent_refs_supports_object_and_string_forms() {
        let object = json!({
            "parentId": "p1",
            "parentIdentifier": "REQ-9"
        });
        assert_eq!(
            parent_refs(&object),
            (Some("p1".into()), Some("REQ-9".into()))
        );

        let string_form = json!({ "parent": "p2" });
        assert_eq!(parent_refs(&string_form), (Some("p2".into()), None));

        let nested = json!({ "parent": { "id": "p3", "identifier": "REQ-3" } });
        assert_eq!(
            parent_refs(&nested),
            (Some("p3".into()), Some("REQ-3".into()))
        );
    }

    #[test]
    fn workitem_id_validation_rejects_path_characters() {
        assert!(validate_workitem_id("123e4567-e89b-12d3-a456-426614174000").is_ok());
        assert!(validate_workitem_id("REQ-123").is_ok());
        assert!(validate_workitem_id("../etc/passwd").is_err());
        assert!(validate_workitem_id("a b").is_err());
    }
}
