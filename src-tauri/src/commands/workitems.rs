use super::common::{as_array, client_of, ensure_write, i64_of, names_of, nested_s, org_of, s};
use crate::AppState;
use serde_json::{json, Value};
use tauri::State;

// ---------- 工作项 ----------

/// POST workitems:search（body: category/spaceId/spaceType/page/perPage）
#[tauri::command]
pub async fn list_workitems(
    state: State<'_, AppState>,
    category: String,
    space_identifier: String,
    next_token: Option<String>,
) -> Result<Value, String> {
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    if space_identifier.trim().is_empty() {
        return Err("NOT_CONFIGURED: 请先在设置中选择默认项目空间".into());
    }
    let page: u32 = next_token
        .and_then(|t| t.parse().ok())
        .unwrap_or(1);
    let per_page = 50u32;
    let body = json!({
        "category": category,
        "spaceId": space_identifier,
        "spaceType": "Project",
        "orderBy": "gmtModified",
        "sort": "desc",
        "page": page,
        "perPage": per_page,
    });
    let resp = c
        .post(&format!("/oapi/v1/projex/organizations/{org}/workitems:search"), &[], body)
        .await?;
    let items: Vec<Value> = as_array(&resp)
        .iter()
        .map(|w| {
            let ident = {
                let a = s(w, "identifier");
                if a.is_empty() { s(w, "serialNumber") } else { a }
            };
            json!({
                "identifier": ident,
                "workitemId": s(w, "id"),
                "subject": s(w, "subject"),
                "status": nested_s(w, "status", "name"),
                "statusStageName": nested_s(w, "status", "stageName"),
                "assignedTo": nested_s(w, "assignedTo", "name"),
                "relatedTo": names_of(w, &["participant", "participants", "relatedUsers"]),
                "spaceName": nested_s(w, "space", "name"),
                "updatedAt": i64_of(w, "gmtModified").map(chrono_ms_to_local).unwrap_or_default(),
                "category": category,
            })
        })
        .collect();
    let next = if (items.len() as u32) >= per_page {
        Some((page + 1).to_string())
    } else {
        None
    };
    Ok(json!({ "items": items, "nextToken": next }))
}

fn chrono_ms_to_local(ms: i64) -> String {
    // 无 chrono：用系统 date 不可取（无 shell）；手写 ms→UTC 粗转换仅用于展示
    let secs = ms / 1000;
    let days = secs / 86400;
    let rem = secs % 86400;
    let (h, mi, se) = (rem / 3600, (rem % 3600) / 60, rem % 60);
    // 1970-01-01 起的天数 → 年月日（民用算法）
    let (y, mo, d) = civil_from_days(days);
    format!("{y:04}-{mo:02}-{d:02} {h:02}:{mi:02}:{se:02}")
}

fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as i64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = (if mp < 10 { mp + 3 } else { mp - 9 }) as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

#[tauri::command]
pub async fn get_workitem(state: State<'_, AppState>, workitem_id: String) -> Result<Value, String> {
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    c.get(&format!("/oapi/v1/projex/organizations/{org}/workitems/{workitem_id}"), &[]).await
}

#[tauri::command]
pub async fn list_workitem_comments(state: State<'_, AppState>, workitem_id: String) -> Result<Value, String> {
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    c.get(
        &format!("/oapi/v1/projex/organizations/{org}/workitems/{workitem_id}/comments"),
        &[("page", "1".to_string()), ("perPage", "50".to_string())],
    )
    .await
}

/// PUT workitems/{id} body {status}
#[tauri::command]
pub async fn update_workitem_status(
    state: State<'_, AppState>,
    workitem_id: String,
    status_identifier: String,
) -> Result<Value, String> {
    ensure_write(&state)?;
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    c.put(
        &format!("/oapi/v1/projex/organizations/{org}/workitems/{workitem_id}"),
        &[],
        json!({ "status": status_identifier }),
    )
    .await
}

