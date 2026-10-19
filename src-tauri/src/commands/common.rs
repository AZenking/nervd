//! Shared state access and response parsing for IPC commands.

use crate::credentials;
use crate::yunxiao::YunxiaoClient;
use crate::AppState;
use serde_json::Value;
use std::sync::Arc;
use tauri::State;

pub(super) fn client_of(state: &State<'_, AppState>) -> Result<Arc<YunxiaoClient>, String> {
    state
        .client
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "NOT_CONFIGURED: 请先在设置中保存个人访问令牌与组织 ID".to_string())
}

pub(super) fn org_of(state: &State<'_, AppState>) -> Result<String, String> {
    let s = state.settings.lock().unwrap();
    if s.organization_id.trim().is_empty() {
        return Err("NOT_CONFIGURED: 请先在设置中填写组织 ID".into());
    }
    Ok(s.organization_id.clone())
}

pub(super) fn ensure_write(state: &State<'_, AppState>) -> Result<(), String> {
    if !state.settings.lock().unwrap().allow_write_ops {
        return Err("WRITE_DISABLED: 请在设置中开启写操作（需要写权限的个人令牌）".into());
    }
    Ok(())
}

pub(super) fn rebuild(state: &State<'_, AppState>, app: &tauri::AppHandle) {
    let settings = credentials::load_settings(app);
    let client = credentials::load_pat()
        .and_then(|p| YunxiaoClient::new(&p).ok())
        .map(Arc::new);
    *state.settings.lock().unwrap() = settings;
    *state.client.lock().unwrap() = client;
}

// 响应取值助手（oapi/v1 字段风格：驼峰，状态/人是嵌套对象）
pub(super) fn s(v: &Value, key: &str) -> String {
    v.get(key)
        .and_then(|x| x.as_str())
        .unwrap_or_default()
        .to_string()
}
pub(super) fn s2(v: &Value, a: &str, b: &str) -> String {
    let x = s(v, a);
    if x.is_empty() {
        s(v, b)
    } else {
        x
    }
}
pub(super) fn nested_s(v: &Value, outer: &str, inner: &str) -> String {
    v.get(outer)
        .and_then(|o| o.get(inner))
        .and_then(|x| x.as_str())
        .unwrap_or_default()
        .to_string()
}
/// 关联人姓名列表：候选字段任一命中即取（元素为 {name} 对象或纯字符串），去重保序
pub(super) fn names_of(v: &Value, keys: &[&str]) -> Vec<String> {
    for k in keys {
        let names: Vec<String> = v
            .get(k)
            .and_then(|x| x.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|e| {
                        if let Some(s) = e.as_str() {
                            return Some(s.to_string());
                        }
                        ["name", "displayName"]
                            .iter()
                            .find_map(|f| e.get(f).and_then(|n| n.as_str()).map(|s| s.to_string()))
                    })
                    .collect()
            })
            .unwrap_or_default();
        let mut out: Vec<String> = Vec::with_capacity(names.len());
        for n in names {
            if !n.is_empty() && !out.contains(&n) {
                out.push(n);
            }
        }
        if !out.is_empty() {
            return out;
        }
    }
    Vec::new()
}

/// 关联人 ID 列表：候选字段任一命中即取（元素为 {id} 对象或纯字符串），去重保序
pub(super) fn ids_of(v: &Value, keys: &[&str]) -> Vec<String> {
    for k in keys {
        let ids: Vec<String> = v
            .get(k)
            .and_then(|x| x.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|e| {
                        if let Some(s) = e.as_str() {
                            return Some(s.to_string());
                        }
                        ["id", "identifier", "userId"]
                            .iter()
                            .find_map(|f| e.get(f).and_then(|n| n.as_str()).map(|s| s.to_string()))
                    })
                    .collect()
            })
            .unwrap_or_default();
        let mut out: Vec<String> = Vec::with_capacity(ids.len());
        for id in ids {
            if !id.is_empty() && !out.contains(&id) {
                out.push(id);
            }
        }
        if !out.is_empty() {
            return out;
        }
    }
    Vec::new()
}
pub(super) fn i64_of(v: &Value, key: &str) -> Option<i64> {
    v.get(key).and_then(|x| x.as_i64())
}
pub(super) fn as_array(v: &Value) -> Vec<Value> {
    match v {
        Value::Array(a) => a.clone(),
        Value::Object(_) => {
            // 兼容 {result:[...]} / {pipelines:[...]} 包装
            for k in ["result", "pipelines", "items", "data"] {
                if let Some(a) = v.get(k).and_then(|x| x.as_array()) {
                    return a.clone();
                }
                // 二级包装 result.Result
                if let Some(a) = v
                    .get(k)
                    .and_then(|x| x.get("Result"))
                    .and_then(|x| x.as_array())
                {
                    return a.clone();
                }
            }
            vec![]
        }
        _ => vec![],
    }
}

/// 归一化 Codeup OpenAPI 分页聚合收集器：
/// 循环翻页请求（单页 100），直到拉完或达到安全上限 max_items，自动合并所有项并返回
pub(super) async fn fetch_all_codeup_pages(
    client: &YunxiaoClient,
    path: &str,
    base_query: &[(&str, String)],
    max_items: usize,
) -> Result<Vec<Value>, String> {
    let mut page: i64 = 1;
    let per_page: i64 = 100;
    let mut all_items: Vec<Value> = Vec::new();

    loop {
        let mut q = base_query.to_vec();
        q.push(("page", page.to_string()));
        q.push(("perPage", per_page.to_string()));

        let resp = client.get(path, &q).await?;
        let items = as_array(&resp);
        let count = items.len();
        all_items.extend(items);

        if count < (per_page as usize) || all_items.len() >= max_items {
            break;
        }
        page += 1;
    }

    Ok(all_items)
}
