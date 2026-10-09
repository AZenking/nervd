//! 迭代（Sprint）IPC：云效项目迭代列表的防御式封装。
//! 实测（2026-10，PAT 环境）：迭代列表挂项目维度，
//! GET /oapi/v1/projex/organizations/{org}/projects/{spaceIdentifier}/sprints
//! （openapi-rdc 主机；不带 /projects/{space} 的 sprints 路径一律 404）。
//! 响应为裸数组：[{id,name,description,status,startDate,endDate,…}]，status ∈ TODO/DOING/ARCHIVED。

use super::common::{as_array, client_of, i64_of, org_of, s, s2};
use super::workitems::chrono_ms_to_local;
use crate::AppState;
use serde_json::{json, Value};
use tauri::State;

fn date_of(ms: i64) -> String {
    chrono_ms_to_local(ms).chars().take(10).collect()
}

/// 迭代状态映射：TODO→未开始 / DOING→进行中 / ARCHIVED→已归档 / DONE→已完成；
/// 其余枚举原样返回，缺失时按起止时间推断。
fn sprint_state_of(e: &Value, start_ms: Option<i64>, end_ms: Option<i64>) -> String {
    let raw = s2(e, "sprintStatusName", "status");
    let mapped = match raw.as_str() {
        "TODO" => "未开始".to_string(),
        "DOING" => "进行中".to_string(),
        "ARCHIVED" => "已归档".to_string(),
        "DONE" => "已完成".to_string(),
        "" => String::new(),
        other => other.to_string(),
    };
    if !mapped.is_empty() {
        return mapped;
    }
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    match (start_ms, end_ms) {
        (Some(_), Some(en)) if now > en => "已结束".to_string(),
        (Some(st), Some(en)) if now >= st && now <= en => "进行中".to_string(),
        (Some(_), Some(_)) => "未开始".to_string(),
        _ => String::new(),
    }
}

/// GET projects/{space}/sprints → [{id,name,title,state,startDate,endDate}]（名称为空的行丢弃）
#[tauri::command]
pub async fn list_iterations(state: State<'_, AppState>) -> Result<Value, String> {
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    let space = {
        let st = state.settings.lock().unwrap();
        st.default_space_identifier.trim().to_string()
    };
    if space.is_empty() {
        return Err("NOT_CONFIGURED: 请先在设置中选择默认项目空间".into());
    }
    let path = format!("/oapi/v1/projex/organizations/{org}/projects/{space}/sprints");
    let query = [("page", "1".to_string()), ("perPage", "100".to_string())];
    let resp = c.get(&path, &query).await?;
    let items: Vec<Value> = as_array(&resp)
        .iter()
        .map(|e| {
            let start_ms = i64_of(e, "startDate");
            let end_ms = i64_of(e, "endDate");
            json!({
                "id": s2(e, "id", "identifier"),
                "name": s2(e, "name", "title"),
                "title": s(e, "description"),
                "state": sprint_state_of(e, start_ms, end_ms),
                "startDate": start_ms.map(date_of).unwrap_or_default(),
                "endDate": end_ms.map(date_of).unwrap_or_default(),
            })
        })
        .filter(|it| !s(it, "name").is_empty())
        .collect();
    if items.is_empty() {
        return Err("EMPTY: 项目下没有迭代".into());
    }
    Ok(json!(items))
}
