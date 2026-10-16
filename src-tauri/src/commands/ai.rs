//! AI 助手 IPC 命令与配置管理

use keyring::Entry;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

pub const SERVICE: &str = "dev.nervd.app";
pub const ACCOUNT_AI_KEY: &str = "ai_api_key";

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct AiCustomPrompts {
    pub breakdown: Option<String>,
    pub comment_summary: Option<String>,
    pub comment_draft: Option<String>,
    pub repo_recommendation: Option<String>,
    pub merge_request: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct AiSettings {
    pub provider: String,
    pub base_url: String,
    pub model: String,
    pub temperature: f32,
    pub breakdown_mode: String,
    pub default_breakdown_tags: Vec<String>,
    pub custom_prompts: Option<AiCustomPrompts>,
}

impl Default for AiSettings {
    fn default() -> Self {
        Self {
            provider: "dashscope".into(),
            base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1".into(),
            model: "qwen-plus".into(),
            temperature: 0.3,
            breakdown_mode: "review".into(),
            default_breakdown_tags: vec!["前端".into(), "后端".into(), "自测".into()],
            custom_prompts: None,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

pub fn ai_settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法定位应用数据目录: {e}"))?;
    Ok(dir.join("ai_settings.json"))
}

pub fn load_ai_settings(app: &AppHandle) -> AiSettings {
    let Ok(path) = ai_settings_path(app) else {
        return AiSettings::default();
    };
    let Ok(text) = std::fs::read_to_string(path) else {
        return AiSettings::default();
    };
    serde_json::from_str(&text).unwrap_or_default()
}

pub fn save_ai_settings_file(app: &AppHandle, s: &AiSettings) -> Result<(), String> {
    let path = ai_settings_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建数据目录失败: {e}"))?;
    }
    let text = serde_json::to_string_pretty(s).map_err(|e| format!("序列化失败: {e}"))?;
    std::fs::write(path, text).map_err(|e| format!("写入 AI 设置失败: {e}"))
}

pub fn load_ai_key() -> Option<String> {
    Entry::new(SERVICE, ACCOUNT_AI_KEY).ok()?.get_password().ok()
}

pub fn has_ai_key() -> bool {
    load_ai_key().is_some()
}

pub fn save_ai_key(key: &str) -> Result<(), String> {
    let entry = Entry::new(SERVICE, ACCOUNT_AI_KEY).map_err(|e| format!("Keychain 打开失败: {e}"))?;
    entry
        .set_password(key.trim())
        .map_err(|e| format!("Keychain 写入 API Key 失败: {e}"))
}

pub fn delete_ai_key() -> Result<(), String> {
    match Entry::new(SERVICE, ACCOUNT_AI_KEY) {
        Ok(entry) => match entry.get_password() {
            Ok(_) => entry
                .delete_credential()
                .map_err(|e| format!("Keychain 删除 API Key 失败: {e}")),
            Err(_) => Ok(()),
        },
        Err(e) => Err(format!("Keychain 打开失败: {e}")),
    }
}

#[tauri::command]
pub async fn get_ai_settings(app: AppHandle) -> Result<Value, String> {
    let st = load_ai_settings(&app);
    let mut v = serde_json::to_value(&st).map_err(|e| e.to_string())?;
    if let Some(map) = v.as_object_mut() {
        map.insert("hasApiKey".into(), json!(has_ai_key()));
    }
    Ok(v)
}

#[tauri::command]
pub async fn save_ai_settings(app: AppHandle, settings: AiSettings) -> Result<Value, String> {
    save_ai_settings_file(&app, &settings)?;
    let mut v = serde_json::to_value(&settings).map_err(|e| e.to_string())?;
    if let Some(map) = v.as_object_mut() {
        map.insert("hasApiKey".into(), json!(has_ai_key()));
    }
    Ok(v)
}

#[tauri::command]
pub async fn save_ai_api_key(api_key: String) -> Result<bool, String> {
    if api_key.trim().is_empty() {
        return Err("API Key 不能为空".into());
    }
    save_ai_key(&api_key)?;
    Ok(true)
}

#[tauri::command]
pub async fn delete_ai_api_key() -> Result<bool, String> {
    delete_ai_key()?;
    Ok(true)
}

/// 智能规范化 AI 请求端点，兼顾多种输入格式：
/// 1. 若以 /chat/completions 结尾，直接作为完整 endpoint；
/// 2. 若误填了 /messages 结尾（Anthropic 风格或误贴），去掉 /messages 并规范化为 /chat/completions；
/// 3. 若为常规 Base URL，在末尾补全 /chat/completions。
pub fn resolve_ai_endpoint(base_url: &str) -> String {
    let raw = base_url.trim().trim_end_matches('/');
    if raw.ends_with("/chat/completions") {
        raw.to_string()
    } else if let Some(stripped) = raw.strip_suffix("/messages") {
        let clean = stripped.trim_end_matches('/');
        format!("{clean}/chat/completions")
    } else {
        format!("{raw}/chat/completions")
    }
}

/// 校验 HTTP 响应，拦截重定向（防 IDaaS/SSO 假 200 穿透）与 HTML 网页错误
pub async fn validate_ai_response(res: reqwest::Response) -> Result<reqwest::Response, String> {
    let status = res.status();

    if status.is_redirection() {
        let loc = res
            .headers()
            .get("location")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("未知地址");
        let is_sso = loc.contains("idaas") || loc.contains("oauth2") || loc.contains("login") || loc.contains("sso");
        if is_sso {
            return Err(format!(
                "请求被企业统一身份认证 (IDaaS / SSO) 拦截并重定向至登录页 ({loc})。\n请排查：\n1. 当前网络是否需要连接公司内网或 VPN（如 aTrust）；\n2. 该 API 端点在公网是否未对 API Key 放行；\n3. Base URL 路径是否正确。"
            ));
        } else {
            return Err(format!("接口重定向至 ({loc})，请检查 API Base URL 是否正确。"));
        }
    }

    if !status.is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("接口返回错误 (HTTP {status}): {err_text}"));
    }

    let content_type = res
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default()
        .to_lowercase();

    if content_type.contains("text/html") {
        return Err("接口返回了 HTML 网页而非 JSON 数据。该端点可能被网关防火墙拦截、需要内网环境，或 Base URL 路径不匹配。".into());
    }

    Ok(res)
}

#[tauri::command]
pub async fn test_ai_connection(app: AppHandle) -> Result<Value, String> {
    let settings = load_ai_settings(&app);
    let api_key = load_ai_key().ok_or_else(|| "未在 macOS Keychain 中找到 API Key，请先配置并保存密钥".to_string())?;

    let endpoint = resolve_ai_endpoint(&settings.base_url);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .redirect(reqwest::redirect::Policy::none()) // 禁止自动跟随重定向，防止跨域重定向到企业 SSO 登录页
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))?;

    let payload = json!({
        "model": settings.model,
        "messages": [
            { "role": "system", "content": "You are a health check agent." },
            { "role": "user", "content": "ping" }
        ],
        "max_tokens": 10,
        "temperature": 0.1
    });

    let start = Instant::now();
    let res = client
        .post(&endpoint)
        .header("Authorization", format!("Bearer {}", api_key.trim()))
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("网络请求失败 ({endpoint}): {e}"))?;

    let latency_ms = start.elapsed().as_millis();
    let res = validate_ai_response(res).await?;

    let resp_json: Value = res
        .json()
        .await
        .map_err(|e| format!("解析响应 JSON 失败: {e}"))?;

    let reply = resp_json
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .unwrap_or("ok")
        .trim()
        .to_string();

    Ok(json!({
        "ok": true,
        "latencyMs": latency_ms,
        "model": settings.model,
        "endpoint": endpoint,
        "reply": reply
    }))
}

#[tauri::command]
pub async fn ai_chat_completion(
    app: AppHandle,
    messages: Vec<ChatMessage>,
    temperature: Option<f32>,
    max_tokens: Option<u32>,
) -> Result<String, String> {
    let settings = load_ai_settings(&app);
    let api_key = load_ai_key().ok_or_else(|| "未配置 AI 服务的 API Key，请前往设置中心配置".to_string())?;

    let endpoint = resolve_ai_endpoint(&settings.base_url);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(45))
        .redirect(reqwest::redirect::Policy::none()) // 禁止自动跟随重定向
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))?;

    let temp = temperature.unwrap_or(settings.temperature);
    let max_t = max_tokens.unwrap_or(2048);

    let payload = json!({
        "model": settings.model,
        "messages": messages,
        "temperature": temp,
        "max_tokens": max_t
    });

    let res = client
        .post(&endpoint)
        .header("Authorization", format!("Bearer {}", api_key.trim()))
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("调用大模型端点失败 ({endpoint}): {e}"))?;

    let res = validate_ai_response(res).await?;

    let resp_json: Value = res
        .json()
        .await
        .map_err(|e| format!("解析 AI 响应失败: {e}"))?;

    let content = resp_json
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .ok_or_else(|| "AI 响应格式缺失 choices[0].message.content".to_string())?;

    Ok(content.to_string())
}
