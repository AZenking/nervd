//! 变更归属命令：同步、时间线、待归属、手动指派、编号解析、回写记账与策略。

use crate::attribution::model::{
    ActivityCandidate, ActivityPolicy, AttributionStatus, ChangePage, ResolvedWorkitemRef,
    SyncReport,
};
use crate::attribution::{store, sync};
use crate::AppState;
use tauri::State;

/// 单次请求最多解析的编号数
const MAX_RESOLVE_IDENTIFIERS: usize = 50;

#[tauri::command]
pub async fn sync_attribution(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    repo_ids: Option<Vec<i64>>,
    full: Option<bool>,
) -> Result<SyncReport, String> {
    let repo_ids = match repo_ids {
        Some(ids) => {
            if ids.is_empty() {
                return Err("仓库 ID 列表不能为空".into());
            }
            if ids.iter().any(|id| *id <= 0) {
                return Err("仓库 ID 无效".into());
            }
            Some(ids)
        }
        None => None,
    };
    sync::sync_repos(state.inner(), repo_ids, full.unwrap_or(false), Some(&app)).await
}

#[tauri::command]
pub async fn get_attribution_status(
    state: State<'_, AppState>,
) -> Result<AttributionStatus, String> {
    let syncing = !state.sync_inflight.lock().unwrap().is_empty();
    let conn = state.db.lock().unwrap();
    store::attribution_status(&conn, syncing)
}

#[tauri::command]
pub async fn list_workitem_changes(
    state: State<'_, AppState>,
    workitem_id: String,
    limit: Option<i64>,
    before: Option<i64>,
    include_rollup: Option<bool>,
) -> Result<ChangePage, String> {
    let workitem_id = workitem_id.trim();
    if workitem_id.is_empty() {
        return Err("工作项 ID 不能为空".into());
    }
    if workitem_id.len() > 128 {
        return Err("工作项 ID 过长".into());
    }
    if matches!(before, Some(value) if value < 0) {
        return Err("分页游标无效".into());
    }
    let conn = state.db.lock().unwrap();
    store::list_workitem_changes(
        &conn,
        workitem_id,
        limit,
        before,
        include_rollup.unwrap_or(false),
    )
}

#[tauri::command]
pub async fn list_unattributed_changes(
    state: State<'_, AppState>,
    repo_id: Option<i64>,
    limit: Option<i64>,
) -> Result<ChangePage, String> {
    if matches!(repo_id, Some(id) if id <= 0) {
        return Err("仓库 ID 无效".into());
    }
    let conn = state.db.lock().unwrap();
    store::list_unattributed_changes(&conn, repo_id, limit)
}

#[tauri::command]
pub async fn assign_change_workitem(
    state: State<'_, AppState>,
    event_id: String,
    workitem_id: String,
    relation: Option<String>,
) -> Result<bool, String> {
    let event_id = event_id.trim();
    let workitem_id = workitem_id.trim();
    if event_id.is_empty() {
        return Err("变更事件 ID 不能为空".into());
    }
    if workitem_id.is_empty() {
        return Err("工作项 ID 不能为空".into());
    }
    let relation = relation.map(|value| value.trim().to_string());
    if let Some(relation) = &relation {
        if !store::RELATIONS.contains(&relation.as_str()) {
            return Err(format!(
                "归属关系无效: {relation}（允许 primary/related/rollup）"
            ));
        }
    }
    let conn = state.db.lock().unwrap();
    store::assign_change_workitem(&conn, event_id, workitem_id, relation.as_deref())
}

#[tauri::command]
pub async fn resolve_workitem_identifiers(
    state: State<'_, AppState>,
    identifiers: Vec<String>,
) -> Result<Vec<ResolvedWorkitemRef>, String> {
    if identifiers.is_empty() {
        return Err("标识符列表不能为空".into());
    }
    if identifiers.len() > MAX_RESOLVE_IDENTIFIERS {
        return Err(format!("一次最多解析 {MAX_RESOLVE_IDENTIFIERS} 个标识符"));
    }
    if identifiers
        .iter()
        .all(|identifier| identifier.trim().is_empty())
    {
        return Err("标识符不能为空".into());
    }
    let identifiers: Vec<String> = identifiers
        .into_iter()
        .map(|identifier| identifier.trim().to_string())
        .filter(|identifier| !identifier.is_empty())
        .collect();
    sync::resolve_workitem_identifiers(state.inner(), &identifiers).await
}

#[tauri::command]
pub async fn list_activity_candidates(
    state: State<'_, AppState>,
    limit: Option<i64>,
) -> Result<Vec<ActivityCandidate>, String> {
    let (enabled, child_mode) = {
        let conn = state.db.lock().unwrap();
        let policy = store::load_policy(&conn)?;
        (policy.enabled, policy.child_mode)
    };
    // 关闭回写或子项策略为 off 时没有候选（前端不需要再过滤）
    if !enabled || child_mode == "off" {
        return Ok(Vec::new());
    }
    let conn = state.db.lock().unwrap();
    store::list_activity_candidates(&conn, limit, store::now_ms())
}

#[tauri::command]
pub async fn mark_activity(
    state: State<'_, AppState>,
    event_id: String,
    workitem_id: String,
    status: String,
    comment_id: Option<String>,
    error: Option<String>,
) -> Result<bool, String> {
    let event_id = event_id.trim();
    let workitem_id = workitem_id.trim();
    let status = status.trim();
    if event_id.is_empty() {
        return Err("变更事件 ID 不能为空".into());
    }
    if workitem_id.is_empty() {
        return Err("工作项 ID 不能为空".into());
    }
    if !store::ACTIVITY_STATUSES.contains(&status) {
        return Err(format!(
            "回写状态无效: {status}（允许 pending/posted/failed/skipped）"
        ));
    }
    let comment_id = comment_id.map(|value| value.trim().to_string());
    if matches!(&comment_id, Some(value) if value.len() > 200) {
        return Err("评论 ID 过长".into());
    }
    let error = error.map(|value| {
        let value = value.trim().to_string();
        value.chars().take(500).collect::<String>()
    });
    let conn = state.db.lock().unwrap();
    store::mark_activity(
        &conn,
        event_id,
        workitem_id,
        status,
        comment_id.as_deref(),
        error.as_deref(),
    )
}

#[tauri::command]
pub async fn get_activity_policy(state: State<'_, AppState>) -> Result<ActivityPolicy, String> {
    let conn = state.db.lock().unwrap();
    store::load_policy(&conn)
}

#[tauri::command]
pub async fn save_activity_policy(
    state: State<'_, AppState>,
    policy: ActivityPolicy,
) -> Result<ActivityPolicy, String> {
    let conn = state.db.lock().unwrap();
    store::save_policy(&conn, &policy)
}
