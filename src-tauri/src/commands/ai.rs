//! AI 助手 IPC 命令与配置管理

use keyring::Entry;
use reqwest::Url;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::time::{Duration, Instant};
use tauri::AppHandle;

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
    let dir = crate::credentials::data_dir(app)?;
    let target = dir.join("ai_settings.json");

    if let Ok(legacy_dir) = crate::credentials::legacy_data_dir(app) {
        let legacy_file = legacy_dir.join("ai_settings.json");
        crate::credentials::migrate_file_if_needed(&legacy_file, &target);
    }

    Ok(target)
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
    // 落盘前先校验 Base URL，避免把会导致 API Key 外发的地址保存下来
    validate_ai_base_url(&settings.base_url)?;
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

/// 校验 AI Base URL，防止被篡改的配置把 Authorization（API Key）发往攻击者控制的主机。
///
/// 安全边界按「流量是否离开本机」划分：
/// - 本机回环地址（`localhost`、`127.0.0.0/8`、`::1`）**允许 http**：Ollama / vLLM 等本地推理服务
///   通常不提供 TLS，而流量不离开本机，不存在凭据外泄面；
/// - 其它任何主机必须使用 **https**，否则 API Key 会以明文经过网络；
/// - 一律拒绝私网 / 链路本地 / CGNAT 地址（`10/8`、`172.16/12`、`192.168/16`、`169.254/16`、
///   `100.64/10`、`fc00::/7`、`fe80::/10`）与 `*.local` 域名：这些会把 API Key 送到局域网其它机器，
///   是本条风险的真实来源；
/// - 路径不允许 `..`，错误信息不回显完整 URL 与 API Key。
pub fn validate_ai_base_url(raw: &str) -> Result<Url, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("AI Base URL 不能为空".to_string());
    }

    let url = Url::parse(trimmed).map_err(|_| "AI Base URL 格式无效".to_string())?;
    if !url.username().is_empty() || url.password().is_some() {
        return Err("AI Base URL 不允许携带账号密码".to_string());
    }

    // Url::parse 会自动消解 ".." 段，因此同时检查原始输入与解析后的路径
    if has_parent_dir(trimmed) || has_parent_dir(url.path()) {
        return Err("AI Base URL 路径不允许包含 ..".to_string());
    }

    let host = url
        .host_str()
        .ok_or_else(|| "AI Base URL 缺少主机名".to_string())?;
    let bare_host = host.trim_start_matches('[').trim_end_matches(']');
    if let Ok(ip) = bare_host.parse::<std::net::IpAddr>() {
        if is_private_or_link_local_ip(ip) {
            return Err("AI Base URL 不允许指向内网、链路本地或 CGNAT 地址".to_string());
        }
    }

    let loopback = is_loopback_host(host);
    let scheme = url.scheme();
    // 仅本机回环允许 http，其余主机一律强制 https
    if scheme != "https" && !(scheme == "http" && loopback) {
        return Err(
            "AI Base URL 必须使用 https（localhost / 127.0.0.1 / ::1 等本机回环地址允许 http）"
                .to_string(),
        );
    }

    let lower = host.trim_end_matches('.').to_ascii_lowercase();
    if lower.ends_with(".local") {
        return Err("AI Base URL 不允许指向局域网域名".to_string());
    }

    Ok(url)
}

/// 判断主机名或 IP 字面量是否指向本机回环（含 `*.localhost` 与 IPv4-mapped IPv6）。
fn is_loopback_host(host: &str) -> bool {
    let bare = host.trim_start_matches('[').trim_end_matches(']');
    if let Ok(ip) = bare.parse::<std::net::IpAddr>() {
        return is_loopback_ip(ip);
    }

    let lower = host.trim_end_matches('.').to_ascii_lowercase();
    lower == "localhost" || lower.ends_with(".localhost")
}

fn is_loopback_ip(ip: std::net::IpAddr) -> bool {
    use std::net::IpAddr;

    match ip {
        IpAddr::V4(v4) => v4.is_loopback(),
        IpAddr::V6(v6) => {
            v6.is_loopback()
                || v6.to_ipv4_mapped()
                    .map(|v4| v4.is_loopback())
                    .unwrap_or(false)
        }
    }
}

/// 判断 IP 是否属于私网、链路本地、CGNAT 等会把凭据送往局域网其它机器的地址段。
fn is_private_or_link_local_ip(ip: std::net::IpAddr) -> bool {
    use std::net::IpAddr;

    match ip {
        IpAddr::V4(v4) => {
            let octets = v4.octets();
            v4.is_private()           // 10/8、172.16/12、192.168/16
                || v4.is_link_local() // 169.254/16
                || v4.is_unspecified()
                || v4.is_broadcast()
                || (octets[0] == 100 && (64..=127).contains(&octets[1])) // 100.64/10 (CGNAT)
        }
        IpAddr::V6(v6) => {
            if let Some(v4) = v6.to_ipv4_mapped() {
                return is_private_or_link_local_ip(IpAddr::V4(v4));
            }
            let segments = v6.segments();
            v6.is_unspecified()
                || (segments[0] & 0xfe00) == 0xfc00 // fc00::/7 唯一本地地址
                || (segments[0] & 0xffc0) == 0xfe80 // fe80::/10 链路本地
        }
    }
}

/// 检查 URL 路径段中是否包含 ".."（同时识别百分号编码的点）。
fn has_parent_dir(raw: &str) -> bool {
    let after_scheme = raw.split_once("://").map(|(_, rest)| rest).unwrap_or(raw);
    let path_start = after_scheme
        .find(['/', '?', '#'])
        .unwrap_or(after_scheme.len());
    let path_and_more = &after_scheme[path_start..];
    let path = path_and_more
        .split(['?', '#'])
        .next()
        .unwrap_or(path_and_more);

    let lowered = path.to_ascii_lowercase();
    lowered.contains("%2e") || path.split('/').any(|segment| segment == "..")
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
    // 请求前校验 Base URL，避免把 Keychain 中的 API Key 发往内网或回环地址
    let base = validate_ai_base_url(&settings.base_url)?;
    let api_key = load_ai_key().ok_or_else(|| "未在 macOS Keychain 中找到 API Key，请先配置并保存密钥".to_string())?;

    let endpoint = resolve_ai_endpoint(base.as_str());

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
    // 请求前校验 Base URL，避免把 Keychain 中的 API Key 发往内网或回环地址
    let base = validate_ai_base_url(&settings.base_url)?;
    let api_key = load_ai_key().ok_or_else(|| "未配置 AI 服务的 API Key，请前往设置中心配置".to_string())?;

    let endpoint = resolve_ai_endpoint(base.as_str());

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ai_settings_migration_copies_legacy_file() {
        let unique_id = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let test_dir = std::env::temp_dir().join(format!("nervd_test_ai_migration_{unique_id}"));
        let legacy_dir = test_dir.join(crate::credentials::LEGACY_STORAGE_DIR_NAME);
        let new_dir = test_dir.join(crate::credentials::STORAGE_DIR_NAME);
        std::fs::create_dir_all(&legacy_dir).unwrap();

        let legacy_file = legacy_dir.join("ai_settings.json");
        let target_file = new_dir.join("ai_settings.json");

        let sample_ai_settings = r#"{"provider":"dashscope","model":"qwen-turbo","temperature":0.5}"#;
        std::fs::write(&legacy_file, sample_ai_settings).unwrap();

        crate::credentials::migrate_file_if_needed(&legacy_file, &target_file);

        assert!(target_file.exists());
        let content = std::fs::read_to_string(&target_file).unwrap();
        assert_eq!(content, sample_ai_settings);
        assert!(legacy_file.exists(), "旧 AI 设置文件应完整保留备份");

        let _ = std::fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_resolve_ai_endpoint() {
        assert_eq!(
            resolve_ai_endpoint("https://api.openai.com/v1"),
            "https://api.openai.com/v1/chat/completions"
        );
        assert_eq!(
            resolve_ai_endpoint("https://api.openai.com/v1/"),
            "https://api.openai.com/v1/chat/completions"
        );
        assert_eq!(
            resolve_ai_endpoint("https://api.openai.com/v1/chat/completions"),
            "https://api.openai.com/v1/chat/completions"
        );
        assert_eq!(
            resolve_ai_endpoint("https://api.anthropic.com/v1/messages"),
            "https://api.anthropic.com/v1/chat/completions"
        );
    }

    #[test]
    fn test_validate_ai_base_url_accepts_public_https_and_local_loopback() {
        assert!(validate_ai_base_url("https://api.openai.com/v1").is_ok());
        assert!(validate_ai_base_url("https://dashscope.aliyuncs.com/compatible-mode/v1").is_ok());
        // 本机回环：http 不离开本机，允许（Ollama / vLLM 等本地推理服务）
        assert!(validate_ai_base_url("http://localhost:11434/v1").is_ok());
        assert!(validate_ai_base_url("https://localhost/v1").is_ok());
        assert!(validate_ai_base_url("http://127.0.0.1:8080/v1").is_ok());
        assert!(validate_ai_base_url("https://127.1.2.3/v1").is_ok());
        assert!(validate_ai_base_url("http://[::1]:11434/v1").is_ok());
        assert!(validate_ai_base_url("https://api.localhost/v1").is_ok());
        assert!(validate_ai_base_url("https://[::ffff:127.0.0.1]/v1").is_ok());
    }

    #[test]
    fn test_validate_ai_base_url_http_only_allowed_for_loopback() {
        let cases = [
            // 本机回环：允许 http
            ("http://localhost:11434/v1", true),
            ("http://127.0.0.1:8080/v1", true),
            ("http://[::1]:11434/v1", true),
            // 私网 / 链路本地：无论 http 还是 https 都拒绝
            ("http://192.168.1.10/v1", false),
            ("https://192.168.1.10/v1", false),
            ("http://10.0.0.8/v1", false),
            ("http://169.254.169.254/latest/meta-data", false),
            // 非 loopback 的公网主机：强制 https
            ("http://evil.example.com/v1", false),
            ("https://evil.example.com/v1", true),
            // loopback 用 https 同样合法
            ("https://127.0.0.1/v1", true),
        ];
        for (url, expected_ok) in cases {
            let result = validate_ai_base_url(url);
            assert_eq!(
                result.is_ok(),
                expected_ok,
                "URL {url} 预期 ok={expected_ok}，实际 {result:?}"
            );
        }
    }

    #[test]
    fn test_validate_ai_base_url_rejects_unsafe_targets() {
        let cases = [
            "",
            "api.openai.com/v1",
            "http://api.openai.com/v1",
            "https://10.0.0.8/v1",
            "https://172.20.1.1/v1",
            "https://192.168.1.10/v1",
            "https://169.254.169.254/latest/meta-data",
            "https://[fd00::1]/v1",
            "https://[fe80::1]/v1",
            "https://[::ffff:192.168.1.10]/v1",
            "https://api.example.com/v1/../admin",
            "https://api.example.com/v1/%2e%2e/admin",
            "https://user:secret@api.example.com/v1",
            "https://printer.local/v1",
        ];
        for case in cases {
            assert!(validate_ai_base_url(case).is_err(), "应拒绝: {case}");
        }
    }
}
