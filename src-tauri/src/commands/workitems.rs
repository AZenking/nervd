use super::common::{as_array, client_of, ensure_write, i64_of, names_of, nested_s, org_of, s, s2};
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

/// 在响应任意层级寻找首个「元素为含非空 subject 的工作项」的数组。
/// 云效各接口的包装层级不定（result:[…] / result.relationList:[…] / relationList.relationList:[…]…），
/// 以内容特征定位，避免逐个猜测包装结构。
fn find_workitem_array(v: &Value, depth: usize) -> Option<Vec<Value>> {
    if depth > 6 {
        return None;
    }
    if let Value::Array(a) = v {
        let looks_right = a
            .iter()
            .any(|x| x.get("subject").and_then(|s| s.as_str()).is_some_and(|s| !s.is_empty()));
        if looks_right {
            return Some(a.clone());
        }
    }
    if let Value::Object(m) = v {
        for child in m.values() {
            if let Some(found) = find_workitem_array(child, depth + 1) {
                return Some(found);
            }
        }
    }
    None
}

/// GET getRelations?relationType=SUB（docs/yunxiao-api.md GetWorkitemRelations，ROA 2021-06-25 形态）
/// 返回工作项的子工作项（SUB 关系）；identifier 在 ROA 族下即工作项 UUID，可直接用于打开详情。
#[tauri::command]
pub async fn list_workitem_children(state: State<'_, AppState>, workitem_id: String) -> Result<Value, String> {
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    let resp = c
        .get(
            &format!("/organization/{org}/workitems/{workitem_id}/getRelations"),
            &[("relationType", "SUB".to_string())],
        )
        .await?;
    let raw = find_workitem_array(&resp, 0).unwrap_or_default();
    let items: Vec<Value> = raw
        .iter()
        .map(|w| {
            let gmt = i64_of(w, "gmtModified")
                .or_else(|| s(w, "gmtModified").trim().parse::<i64>().ok());
            json!({
                "identifier": s(w, "identifier"),
                "subject": s(w, "subject"),
                "category": s(w, "categoryIdentifier"),
                "gmtModified": gmt.map(chrono_ms_to_local).unwrap_or_default(),
            })
        })
        .collect();
    // 空结果时带回原始响应片段，便于在前端诊断包装形态差异
    let raw_sample = if items.is_empty() {
        serde_json::to_string(&resp)
            .unwrap_or_default()
            .chars()
            .take(400)
            .collect::<String>()
    } else {
        String::new()
    };
    Ok(json!({ "items": items, "rawSample": raw_sample }))
}

/// GET listWorkflowStatus（docs/yunxiao-api.md ListWorkItemWorkFlowStatus；spaceIdentifier 取设置 defaultSpaceIdentifier）
/// 先试 oapi/v1 形态，404/失败再退旧 ROA 形态；两形态均失败返回 UNSUPPORTED
#[tauri::command]
pub async fn list_workitem_status(
    state: State<'_, AppState>,
    category: String,
) -> Result<Value, String> {
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    let space = {
        let st = state.settings.lock().unwrap();
        if st.default_space_identifier.trim().is_empty() {
            return Err("NOT_CONFIGURED: 请先在设置中选择默认项目空间".into());
        }
        st.default_space_identifier.clone()
    };
    let query = [
        ("spaceType", "Project".to_string()),
        ("spaceIdentifier", space),
        ("workitemCategoryIdentifier", category),
    ];
    let oapi_form =
        format!("/oapi/v1/projex/organizations/{org}/workitems/workflow/listWorkflowStatus");
    let roa_form = format!("/organization/{org}/workitems/workflow/listWorkflowStatus");
    for path in [&oapi_form, &roa_form] {
        if let Ok(v) = c.get(path, &query).await {
            let items: Vec<Value> = status_array_of(&v)
                .iter()
                .filter_map(|e| {
                    status_id_of(e).map(|identifier| json!({
                        "identifier": identifier,
                        "name": s(e, "name"),
                        "stageName": s2(e, "stageName", "workflowStageName"),
                    }))
                })
                .collect();
            if !items.is_empty() {
                return Ok(json!(items));
            }
        }
    }
    Err("UNSUPPORTED: 工作流状态接口不可用".into())
}

/// 状态条目标识：identifier|id|statusIdentifier 任一非空字段（字符串或数字）
fn status_id_of(e: &Value) -> Option<String> {
    for k in ["identifier", "id", "statusIdentifier"] {
        if let Some(x) = e.get(k) {
            if let Some(s) = x.as_str() {
                if !s.is_empty() {
                    return Some(s.to_string());
                }
            }
            if let Some(n) = x.as_i64() {
                return Some(n.to_string());
            }
        }
    }
    None
}

/// 防御式解包状态数组：裸数组 / {result:[…]} / {statuses:{status:[…]}} 等包装形态下，
/// 递归取首个「元素含状态字段」的数组
fn status_array_of(v: &Value) -> Vec<Value> {
    let is_entry = |e: &Value| status_id_of(e).is_some() || !s(e, "name").is_empty();
    match v {
        Value::Array(a) => {
            if a.iter().any(is_entry) {
                return a.clone();
            }
            for e in a {
                let found = status_array_of(e);
                if !found.is_empty() {
                    return found;
                }
            }
            vec![]
        }
        Value::Object(o) => {
            for e in o.values() {
                let found = status_array_of(e);
                if !found.is_empty() {
                    return found;
                }
            }
            vec![]
        }
        _ => vec![],
    }
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

// ---------- 附件图片代理（富文本描述内联直显） ----------

/// 代理响应大小上限：5MB
const PROXY_MAX_IMAGE_BYTES: usize = 5 * 1024 * 1024;

/// SSRF 白名单：devops.aliyun.com 或 *.aliyuncs.com（含多级子域）
fn proxy_host_allowed(host: &str) -> bool {
    let h = host.trim_end_matches('.').to_ascii_lowercase();
    h == "devops.aliyun.com" || h == "aliyuncs.com" || h.ends_with(".aliyuncs.com")
}

/// base64 标准字母表编码（不引入新依赖）
fn base64_encode(data: &[u8]) -> String {
    const TBL: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let n = ((chunk[0] as u32) << 16)
            | ((*chunk.get(1).unwrap_or(&0) as u32) << 8)
            | (*chunk.get(2).unwrap_or(&0) as u32);
        out.push(TBL[(n >> 18 & 63) as usize] as char);
        out.push(TBL[(n >> 12 & 63) as usize] as char);
        out.push(if chunk.len() > 1 { TBL[(n >> 6 & 63) as usize] as char } else { '=' });
        out.push(if chunk.len() > 2 { TBL[(n & 63) as usize] as char } else { '=' });
    }
    out
}

/// GET 云效附件图片（x-yunxiao-token，与 YunxiaoClient 同一鉴权方式）。
/// host 白名单（devops.aliyun.com / *.aliyuncs.com，重定向同样校验）+
/// Content-Type image/* + ≤5MB，成功返回 data:<mime>;base64,<payload>；
/// 鉴权被拒（401/403）等一律 Err（含状态码），不做任何绕过。
#[tauri::command]
pub async fn proxy_workitem_file(state: State<'_, AppState>, url: String) -> Result<String, String> {
    let _ = client_of(&state)?; // 统一 NOT_CONFIGURED 口径
    let pat = crate::credentials::load_pat()
        .ok_or_else(|| "NOT_CONFIGURED: 请先在设置中保存个人访问令牌".to_string())?
        .trim()
        .to_string();
    let parsed = reqwest::Url::parse(url.trim())
        .map_err(|e| format!("PROXY 拒绝: URL 非法（{e}）"))?;
    if parsed.scheme() != "https" {
        return Err(format!("PROXY 拒绝: 仅允许 https（实际 {}）", parsed.scheme()));
    }
    let host = parsed
        .host_str()
        .ok_or("PROXY 拒绝: URL 缺少主机名")?;
    if !proxy_host_allowed(host) {
        return Err(format!("PROXY 拒绝: 主机 {host} 不在白名单（devops.aliyun.com / *.aliyuncs.com）"));
    }
    // 重定向目标也必须落在白名单内，最多 5 跳
    let redirect = reqwest::redirect::Policy::custom(|attempt| {
        match attempt.url().host_str().map(proxy_host_allowed) {
            Some(true) if attempt.previous().len() < 5 => attempt.follow(),
            _ => attempt.error("重定向目标不在白名单或次数超限"),
        }
    });
    let http = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .redirect(redirect)
        .build()
        .map_err(|e| format!("HTTP 客户端初始化失败: {e}"))?;
    let resp = http
        .get(parsed)
        .header("x-yunxiao-token", &pat)
        .send()
        .await
        .map_err(|e| format!("网络错误: {e}"))?;
    let status = resp.status();
    if !status.is_success() {
        return Err(format!("PROXY {status}: 云效附件获取失败"));
    }
    let mime = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|v| v.split(';').next().unwrap_or("").trim().to_ascii_lowercase())
        .unwrap_or_default();
    if !mime.starts_with("image/") {
        return Err(format!("PROXY 拒绝: 非图片响应（Content-Type: {mime}）"));
    }
    if let Some(len) = resp.content_length() {
        if len as usize > PROXY_MAX_IMAGE_BYTES {
            return Err(format!("PROXY 拒绝: 附件超过 5MB（{len} 字节）"));
        }
    }
    let bytes = resp.bytes().await.map_err(|e| format!("网络错误: {e}"))?;
    if bytes.len() > PROXY_MAX_IMAGE_BYTES {
        return Err(format!("PROXY 拒绝: 附件超过 5MB（{} 字节）", bytes.len()));
    }
    Ok(format!("data:{mime};base64,{}", base64_encode(&bytes)))
}

