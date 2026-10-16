//! nervd 客户端版本检查与一键更新 IPC 命令

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;
use tauri::AppHandle;

pub const DEFAULT_REPO: &str = "AZenking/nervd";

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    pub has_update: bool,
    pub current_version: String,
    pub latest_version: String,
    pub release_name: String,
    pub release_notes: String,
    pub published_at: Option<String>,
    pub download_url: Option<String>,
    pub html_url: Option<String>,
}

/// 解析类似 "0.1.0" 或 "v0.1.0" 为三元组 (major, minor, patch)
fn parse_semver(v: &str) -> Option<(u64, u64, u64)> {
    let s = v.trim().trim_start_matches(['v', 'V']);
    let mut parts = s.split('.');
    let major: u64 = parts.next()?.parse().ok()?;
    let minor: u64 = parts.next()?.parse().ok()?;
    let patch: u64 = parts
        .next()?
        .split(|c: char| !c.is_ascii_digit())
        .next()?
        .parse()
        .ok()?;
    Some((major, minor, patch))
}

/// 判断 remote 是否比 local 新
fn is_newer_version(local: &str, remote: &str) -> bool {
    match (parse_semver(local), parse_semver(remote)) {
        (Some(l), Some(r)) => r > l,
        _ => false,
    }
}

/// 从 GitHub Release 网页或重定向 URL 中提取 tag 名称
fn extract_tag_from_release_url(url: &str) -> Option<String> {
    let needle = "/releases/tag/";
    let pos = url.find(needle)?;
    let after = &url[pos + needle.len()..];
    let tag = after.split(&['/', '?', '#'][..]).next()?.trim();
    if tag.is_empty() {
        None
    } else {
        Some(tag.to_string())
    }
}

/// 当 GitHub REST API 受到 IP Rate Limit (403/429) 或网络受阻时，
/// 通过跟随 `https://github.com/{repo}/releases/latest` 的重定向获取最新版本。
/// 该请求走常规网页跳转通道，不受 GitHub API 60次/小时 的 IP 限流限制。
async fn fetch_latest_from_redirect(
    client: &reqwest::Client,
    repo: &str,
    current_version: &str,
) -> Result<UpdateCheckResult, String> {
    let target_url = format!("https://github.com/{repo}/releases/latest");
    let res = client
        .get(&target_url)
        .send()
        .await
        .map_err(|e| format!("请求 Release 重定向失败: {e}"))?;

    let final_url = res.url().as_str();
    let tag = extract_tag_from_release_url(final_url)
        .ok_or_else(|| format!("无法从重定向 URL ({final_url}) 解析版本 Tag"))?;

    let latest_version = tag.trim_start_matches(['v', 'V']).to_string();
    let has_update = is_newer_version(current_version, &latest_version);
    let release_name = format!("nervd {tag}");
    let release_notes = "已通过发布重定向探针获取最新版本信息。点击下载按钮获取最新安装包，或访问 Release 页面查阅变更详情。".to_string();
    let html_url = Some(format!("https://github.com/{repo}/releases/tag/{tag}"));

    #[cfg(target_os = "windows")]
    let download_url = Some(format!(
        "https://github.com/{repo}/releases/download/{tag}/nervd_{latest_version}_x64-setup.exe"
    ));

    #[cfg(target_os = "macos")]
    let download_url = {
        #[cfg(target_arch = "aarch64")]
        let arch_keyword = "aarch64";
        #[cfg(target_arch = "x86_64")]
        let arch_keyword = "x86_64";
        #[cfg(not(any(target_arch = "aarch64", target_arch = "x86_64")))]
        let arch_keyword = "aarch64";

        Some(format!(
            "https://github.com/{repo}/releases/download/{tag}/nervd_{latest_version}_{arch_keyword}.dmg"
        ))
    };

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let download_url = None;

    Ok(UpdateCheckResult {
        has_update,
        current_version: current_version.to_string(),
        latest_version,
        release_name,
        release_notes,
        published_at: None,
        download_url,
        html_url,
    })
}

#[tauri::command]
pub async fn check_for_updates(
    app: AppHandle,
    custom_endpoint: Option<String>,
) -> Result<UpdateCheckResult, String> {
    let current_version = app.package_info().version.to_string();
    let is_custom = custom_endpoint
        .as_ref()
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);

    let endpoint = custom_endpoint
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| {
            format!("https://api.github.com/repos/{}/releases/latest", DEFAULT_REPO)
        });

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .user_agent(format!("nervd-desktop/{}", current_version))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))?;

    let res = client
        .get(&endpoint)
        .header("Accept", "application/vnd.github.v3+json")
        .send()
        .await;

    let res = match res {
        Ok(r) => r,
        Err(e) => {
            // 连接 GitHub API 失败时，如果为默认端点则尝试走重定向探测降级
            if !is_custom {
                if let Ok(fallback) =
                    fetch_latest_from_redirect(&client, DEFAULT_REPO, &current_version).await
                {
                    return Ok(fallback);
                }
            }
            return Err(format!("连接更新服务失败: {e}"));
        }
    };

    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();

        // 遇到 403 (Rate Limit) 或 429 或其他异常时，若为默认端点，自动触发重定向探针降级
        if !is_custom {
            if let Ok(fallback) =
                fetch_latest_from_redirect(&client, DEFAULT_REPO, &current_version).await
            {
                return Ok(fallback);
            }
        }

        // 若 fallback 依然不可用，解析并返回对用户友好的错误信息
        if body.contains("API rate limit exceeded")
            || body.contains("rate limit exceeded")
            || status.as_u16() == 403
            || status.as_u16() == 429
        {
            return Err(
                "GitHub API 访问频次达到限制 (IP 临时受限)。已尝试自动降级，请稍后重试或直接访问 Releases 页面查看与下载最新版本。".to_string(),
            );
        }

        return Err(format!("更新服务响应异常 ({status}): {body}"));
    }

    let json: Value = res
        .json()
        .await
        .map_err(|e| format!("解析更新清单失败: {e}"))?;

    // 支持两类标准更新清单：
    // 1) GitHub Releases API 规范 (tag_name, name, body, html_url, assets)
    // 2) Tauri latest.json 静态清单 (version, notes, pub_date, platforms)
    if let Some(tag_name) = json.get("tag_name").and_then(Value::as_str) {
        let latest_version = tag_name.trim_start_matches(['v', 'V']).to_string();
        let has_update = is_newer_version(&current_version, &latest_version);
        let release_name = json
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or(tag_name)
            .to_string();
        let release_notes = json
            .get("body")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let published_at = json
            .get("published_at")
            .and_then(Value::as_str)
            .map(|s| s.to_string());
        let html_url = json
            .get("html_url")
            .and_then(Value::as_str)
            .map(|s| s.to_string());

        let mut download_url = None;
        if let Some(assets) = json.get("assets").and_then(Value::as_array) {
            #[cfg(target_os = "windows")]
            {
                for asset in assets {
                    if let Some(name) = asset.get("name").and_then(Value::as_str) {
                        if name.ends_with("-setup.exe") || name.ends_with(".exe") || name.ends_with(".msi") {
                            download_url = asset
                                .get("browser_download_url")
                                .and_then(Value::as_str)
                                .map(|s| s.to_string());
                            if name.ends_with("-setup.exe") {
                                break;
                            }
                        }
                    }
                }
            }

            #[cfg(target_os = "macos")]
            {
                #[cfg(target_arch = "aarch64")]
                let arch_keyword = "aarch64";
                #[cfg(target_arch = "x86_64")]
                let arch_keyword = "x86_64";
                #[cfg(not(any(target_arch = "aarch64", target_arch = "x86_64")))]
                let arch_keyword = "dmg";

                for asset in assets {
                    if let Some(name) = asset.get("name").and_then(Value::as_str) {
                        if (name.ends_with(".dmg") || name.ends_with(".tar.gz"))
                            && name.contains(arch_keyword)
                        {
                            download_url = asset
                                .get("browser_download_url")
                                .and_then(Value::as_str)
                                .map(|s| s.to_string());
                            break;
                        }
                    }
                }

                if download_url.is_none() {
                    for asset in assets {
                        if let Some(name) = asset.get("name").and_then(Value::as_str) {
                            if name.ends_with(".dmg") {
                                download_url = asset
                                    .get("browser_download_url")
                                    .and_then(Value::as_str)
                                    .map(|s| s.to_string());
                                break;
                            }
                        }
                    }
                }
            }
        }

        if download_url.is_none() {
            download_url = html_url.clone();
        }

        Ok(UpdateCheckResult {
            has_update,
            current_version,
            latest_version,
            release_name,
            release_notes,
            published_at,
            download_url,
            html_url,
        })
    } else if let Some(version) = json.get("version").and_then(Value::as_str) {
        let latest_version = version.to_string();
        let has_update = is_newer_version(&current_version, &latest_version);
        let release_notes = json
            .get("notes")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let published_at = json
            .get("pub_date")
            .and_then(Value::as_str)
            .map(|s| s.to_string());

        let mut download_url = None;
        if let Some(platforms) = json.get("platforms").and_then(Value::as_object) {
            #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
            let platform_key = "darwin-aarch64";
            #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
            let platform_key = "darwin-x86_64";
            #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
            let platform_key = "windows-x86_64";
            #[cfg(not(any(
                all(target_os = "macos", target_arch = "aarch64"),
                all(target_os = "macos", target_arch = "x86_64"),
                all(target_os = "windows", target_arch = "x86_64"),
            )))]
            let platform_key = "darwin-universal";

            if let Some(p) = platforms.get(platform_key).and_then(Value::as_object) {
                download_url = p.get("url").and_then(Value::as_str).map(|s| s.to_string());
            }
        }

        Ok(UpdateCheckResult {
            has_update,
            current_version,
            latest_version: latest_version.clone(),
            release_name: format!("nervd v{latest_version}"),
            release_notes,
            published_at,
            download_url,
            html_url: None,
        })
    } else {
        Err("无法识别的更新清单响应格式".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_newer_version() {
        assert!(is_newer_version("0.1.0", "0.2.0"));
        assert!(is_newer_version("0.1.0", "v0.1.1"));
        assert!(is_newer_version("1.0.0", "2.0.0"));
        assert!(!is_newer_version("0.2.0", "0.1.0"));
        assert!(!is_newer_version("0.1.0", "0.1.0"));
        assert!(!is_newer_version("0.1.0-beta", "0.1.0"));
    }

    #[test]
    fn test_extract_tag_from_release_url() {
        assert_eq!(
            extract_tag_from_release_url("https://github.com/AZenking/nervd/releases/tag/v0.1.1"),
            Some("v0.1.1".to_string())
        );
        assert_eq!(
            extract_tag_from_release_url("https://github.com/AZenking/nervd/releases/tag/v0.1.1/"),
            Some("v0.1.1".to_string())
        );
        assert_eq!(
            extract_tag_from_release_url("https://github.com/AZenking/nervd/releases/tag/0.2.0?foo=bar#hash"),
            Some("0.2.0".to_string())
        );
        assert_eq!(
            extract_tag_from_release_url("https://github.com/AZenking/nervd/releases"),
            None
        );
    }
}
