//! 分支拓扑：按 track_id 持久化子分支模式 / 基点 / MR 目标。
//!
//! 不修改冻结的 `BranchRuleTemplate`；拓扑是 `branch_tracks` 的附属行，
//! `child_pattern = NULL` 表示沿用旧行为，空字符串表示不建子分支。

use crate::attribution::model::BranchTrackTopology;
use crate::AppState;
use rusqlite::{params, OptionalExtension};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn validate_track_id(track_id: &str) -> Result<String, String> {
    let track_id = track_id.trim();
    if track_id.is_empty() || track_id.len() > 100 {
        return Err("分支模板 ID 无效".into());
    }
    Ok(track_id.to_string())
}

fn validate_topology(topology: &mut BranchTrackTopology) -> Result<(), String> {
    if let Some(pattern) = topology.child_pattern.as_ref() {
        let pattern = pattern.trim();
        if pattern.len() > 255
            || pattern.chars().any(|character| {
                character.is_control() || character.is_whitespace() || "~^:?*[\\".contains(character)
            })
        {
            return Err("子分支模板包含非法字符或过长".into());
        }
        topology.child_pattern = Some(pattern.to_string());
    }
    if !matches!(topology.child_base.as_str(), "requirement" | "baseline") {
        return Err("子分支基点无效".into());
    }
    if !matches!(topology.child_mr_target.as_str(), "parent" | "baseline") {
        return Err("子分支 MR 目标无效".into());
    }
    Ok(())
}

#[tauri::command]
pub async fn get_branch_track_topology(
    state: State<'_, AppState>,
    track_id: String,
) -> Result<BranchTrackTopology, String> {
    let track_id = validate_track_id(&track_id)?;
    let conn = state.db.lock().unwrap();
    let row: Option<(Option<String>, String, String)> = conn
        .query_row(
            "SELECT child_pattern, child_base, child_mr_target
             FROM branch_track_topology WHERE track_id = ?1",
            params![track_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
        .map_err(|e| format!("读取分支拓扑失败: {e}"))?;
    Ok(match row {
        Some((child_pattern, child_base, child_mr_target)) => BranchTrackTopology {
            track_id,
            child_pattern,
            child_base,
            child_mr_target,
        },
        None => BranchTrackTopology {
            track_id,
            ..Default::default()
        },
    })
}

#[tauri::command]
pub async fn save_branch_track_topology(
    state: State<'_, AppState>,
    track_id: String,
    mut topology: BranchTrackTopology,
) -> Result<BranchTrackTopology, String> {
    let track_id = validate_track_id(&track_id)?;
    validate_topology(&mut topology)?;
    topology.track_id = track_id.clone();
    let conn = state.db.lock().unwrap();
    let exists: Option<i64> = conn
        .query_row(
            "SELECT 1 FROM branch_tracks WHERE id = ?1",
            params![track_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| format!("校验分支模板失败: {e}"))?;
    if exists.is_none() {
        return Err("分支模板不存在，请先保存模板再配置子分支拓扑".into());
    }
    conn.execute(
        "INSERT INTO branch_track_topology
            (track_id, child_pattern, child_base, child_mr_target, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(track_id) DO UPDATE SET
            child_pattern = excluded.child_pattern,
            child_base = excluded.child_base,
            child_mr_target = excluded.child_mr_target,
            updated_at = excluded.updated_at",
        params![
            track_id,
            topology.child_pattern,
            topology.child_base,
            topology.child_mr_target,
            now_ms()
        ],
    )
    .map_err(|e| format!("保存分支拓扑失败: {e}"))?;
    Ok(topology)
}