use crate::db::{self, CreateTaskPayload, LocalTask, UpdateTaskPayload};
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn list_local_tasks(
    state: State<'_, AppState>,
    status: Option<String>,
    search: Option<String>,
) -> Result<Vec<LocalTask>, String> {
    let conn = state.db.lock().map_err(|e| format!("获取数据库锁失败: {e}"))?;
    db::list_tasks(&conn, status.as_deref(), search.as_deref())
}

#[tauri::command]
pub async fn create_local_task(
    state: State<'_, AppState>,
    payload: CreateTaskPayload,
) -> Result<LocalTask, String> {
    let conn = state.db.lock().map_err(|e| format!("获取数据库锁失败: {e}"))?;
    db::create_task(&conn, payload)
}

#[tauri::command]
pub async fn update_local_task(
    state: State<'_, AppState>,
    id: String,
    payload: UpdateTaskPayload,
) -> Result<LocalTask, String> {
    let conn = state.db.lock().map_err(|e| format!("获取数据库锁失败: {e}"))?;
    db::update_task(&conn, &id, payload)
}

#[tauri::command]
pub async fn delete_local_task(
    state: State<'_, AppState>,
    id: String,
) -> Result<bool, String> {
    let conn = state.db.lock().map_err(|e| format!("获取数据库锁失败: {e}"))?;
    db::delete_task(&conn, &id)
}
