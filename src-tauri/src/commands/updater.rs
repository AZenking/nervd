//! nervd 客户端版本检查与一键更新 IPC 命令

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};
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

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProgressPayload {
    pub percent: f64,
    pub transferred_bytes: u64,
    pub total_bytes: u64,
    pub speed_bytes_per_sec: u64,
    pub status: String,
    pub message: Option<String>,
}

/// 更新包大小上限（200 MB），避免被恶意服务端用超大文件耗尽磁盘
const MAX_UPDATE_BYTES: u64 = 200 * 1024 * 1024;

/// `.sha256` 校验文件自身的大小上限
const MAX_SHA256_FILE_BYTES: u64 = 64 * 1024;

/// 校验更新下载地址：只允许 https，且主机必须是 github.com 或 *.githubusercontent.com。
/// 更新包与校验文件都来自同一官方发布目录，避免 IPC 入参把应用变成任意下载器。
fn validate_update_url(raw: &str) -> Result<reqwest::Url, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("下载地址无效".to_string());
    }
    let url = reqwest::Url::parse(trimmed).map_err(|_| "下载地址无效".to_string())?;
    if url.scheme() != "https" {
        return Err("下载地址必须使用 https".to_string());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("下载地址不允许携带凭证".to_string());
    }
    let host = url
        .host_str()
        .ok_or_else(|| "下载地址缺少主机名".to_string())?;
    if !is_allowed_update_host(host) {
        return Err("仅允许从 GitHub 官方发布地址下载更新".to_string());
    }
    Ok(url)
}

fn is_allowed_update_host(host: &str) -> bool {
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    host == "github.com" || host.ends_with(".githubusercontent.com")
}

/// 由安装包地址派生同目录下的 `.sha256` 校验文件地址（`x.dmg` → `x.dmg.sha256`）。
fn sha256_sidecar_url(download: &reqwest::Url) -> Result<reqwest::Url, String> {
    let mut url = download.clone();
    url.set_path(&format!("{}.sha256", url.path()));
    url.set_fragment(None);
    Ok(url)
}

/// 从校验文件内容（`<hash>  <filename>`，兼容 sha256sum / shasum 输出）中提取 64 位十六进制摘要。
fn parse_sha256_hex(text: &str) -> Option<String> {
    text.split_whitespace()
        .find(|token| token.len() == 64 && token.chars().all(|c| c.is_ascii_hexdigit()))
        .map(|token| token.to_ascii_lowercase())
}

/// 计算本地文件 SHA-256。为不新增 Cargo 依赖，优先复用系统 shasum / sha256sum，
/// Windows 上再回退到自带的 certutil；与 .github/workflows/release.yml 中 calc_sha256 的产出保持一致。
fn compute_sha256(path: &Path) -> Result<String, String> {
    let attempts: [(&str, &[&str]); 2] = [("shasum", &["-a", "256"]), ("sha256sum", &[])];
    let mut reasons: Vec<String> = Vec::new();

    for (program, args) in attempts {
        match std::process::Command::new(program)
            .args(args)
            .arg(path)
            .output()
        {
            Ok(output) if output.status.success() => {
                if let Some(hash) = parse_sha256_hex(&String::from_utf8_lossy(&output.stdout)) {
                    return Ok(hash);
                }
                reasons.push(format!("{program} 输出无法解析"));
            }
            Ok(output) => reasons.push(format!("{program} 退出状态异常 ({})", output.status)),
            Err(e) => reasons.push(format!("{program} 不可用: {e}")),
        }
    }

    // Windows 未提供 shasum / sha256sum 时使用系统自带 certutil（输出同样包含 64 位十六进制摘要）
    match std::process::Command::new("certutil")
        .arg("-hashfile")
        .arg(path)
        .arg("SHA256")
        .output()
    {
        Ok(output) if output.status.success() => {
            if let Some(hash) = parse_sha256_hex(&String::from_utf8_lossy(&output.stdout)) {
                return Ok(hash);
            }
            reasons.push("certutil 输出无法解析".to_string());
        }
        Ok(output) => reasons.push(format!("certutil 退出状态异常 ({})", output.status)),
        Err(e) => reasons.push(format!("certutil 不可用: {e}")),
    }

    Err(format!(
        "无法计算安装包 SHA-256 校验值（{}）",
        reasons.join("；")
    ))
}

/// 下载发布目录中的 `.sha256` 校验文件并解析摘要；任何异常都视为“无法校验”，由调用方中止安装。
async fn fetch_expected_sha256(
    client: &reqwest::Client,
    download: &reqwest::Url,
) -> Result<String, String> {
    let sidecar = sha256_sidecar_url(download)?;
    let res = client
        .get(sidecar)
        .header("User-Agent", "nervd-updater")
        .send()
        .await
        .map_err(|e| format!("获取更新校验文件失败，已中止安装: {e}"))?;

    if !res.status().is_success() {
        return Err(format!(
            "获取更新校验文件失败 (HTTP {})，已中止安装",
            res.status()
        ));
    }

    if res.content_length().unwrap_or(0) > MAX_SHA256_FILE_BYTES {
        return Err("更新校验文件体积异常，已中止安装".to_string());
    }

    let bytes = res
        .bytes()
        .await
        .map_err(|e| format!("读取更新校验文件失败，已中止安装: {e}"))?;
    if bytes.len() as u64 > MAX_SHA256_FILE_BYTES {
        return Err("更新校验文件体积异常，已中止安装".to_string());
    }

    let text = String::from_utf8_lossy(&bytes);
    parse_sha256_hex(&text).ok_or_else(|| "更新校验文件格式无效，已中止安装".to_string())
}

/// 生成不可预测的临时文件名片段：优先读取系统随机源，退化时使用时间戳 + PID。
fn random_token() -> String {
    #[cfg(unix)]
    {
        use std::io::Read;
        if let Ok(mut file) = std::fs::File::open("/dev/urandom") {
            let mut buf = [0u8; 16];
            if file.read_exact(&mut buf).is_ok() {
                return buf.iter().map(|byte| format!("{byte:02x}")).collect();
            }
        }
    }

    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{nanos:x}{:x}", std::process::id())
}

fn installer_extension() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "dmg"
    }
    #[cfg(target_os = "windows")]
    {
        "exe"
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        "bin"
    }
}

/// 以随机临时名 + `create_new(true)` 独占创建下载文件，
/// 避免固定路径被预置符号链接/同名文件覆盖（符号链接攻击、TOCTOU）。
fn create_temp_installer() -> Result<(std::fs::File, PathBuf), String> {
    use std::io::ErrorKind;

    let dir = std::env::temp_dir();
    for _ in 0..8 {
        let path = dir.join(format!(
            "nervd_update_{}.{}",
            random_token(),
            installer_extension()
        ));
        match std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
        {
            Ok(file) => return Ok((file, path)),
            Err(e) if e.kind() == ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(format!("创建更新临时文件失败: {e}")),
        }
    }

    Err("创建更新临时文件失败: 无法生成唯一临时文件名".to_string())
}

/// 流式下载安装包并上报进度；超过体积上限立即中止。
async fn stream_installer(
    app: &AppHandle,
    client: &reqwest::Client,
    url: &str,
    mut file: std::fs::File,
) -> Result<u64, String> {
    use std::io::Write;
    use std::time::Instant;
    use tauri::Emitter;

    let mut res = client
        .get(url)
        .header("User-Agent", "nervd-updater")
        .send()
        .await
        .map_err(|e| format!("发起更新下载请求失败: {e}"))?;

    if !res.status().is_success() {
        return Err(format!("更新服务响应异常 ({})", res.status()));
    }

    let total_bytes = res.content_length().unwrap_or(0);
    if total_bytes > MAX_UPDATE_BYTES {
        return Err(format!("更新包体积异常（{total_bytes} 字节），已中止下载"));
    }

    let start_time = Instant::now();
    let mut last_emit = Instant::now();
    let mut transferred: u64 = 0;

    let _ = app.emit(
        "update-progress",
        UpdateProgressPayload {
            percent: 0.0,
            transferred_bytes: 0,
            total_bytes,
            speed_bytes_per_sec: 0,
            status: "downloading".to_string(),
            message: Some("正在连接更新服务器…".to_string()),
        },
    );

    while let Some(chunk) = res
        .chunk()
        .await
        .map_err(|e| format!("下载安装包数据流失败: {e}"))?
    {
        transferred += chunk.len() as u64;
        if transferred > MAX_UPDATE_BYTES {
            return Err("更新包体积超过 200MB 上限，已中止下载".to_string());
        }
        file.write_all(&chunk)
            .map_err(|e| format!("写入更新文件失败: {e}"))?;

        if last_emit.elapsed() >= Duration::from_millis(150)
            || (total_bytes > 0 && transferred >= total_bytes)
        {
            let elapsed_sec = start_time.elapsed().as_secs_f64();
            let speed = if elapsed_sec > 0.0 {
                (transferred as f64 / elapsed_sec) as u64
            } else {
                0
            };
            let percent = if total_bytes > 0 {
                ((transferred as f64 / total_bytes as f64) * 100.0).clamp(0.0, 100.0)
            } else {
                0.0
            };
            let _ = app.emit(
                "update-progress",
                UpdateProgressPayload {
                    percent,
                    transferred_bytes: transferred,
                    total_bytes,
                    speed_bytes_per_sec: speed,
                    status: "downloading".to_string(),
                    message: None,
                },
            );
            last_emit = Instant::now();
        }
    }

    file.flush()
        .map_err(|e| format!("保存更新文件失败: {e}"))?;

    Ok(transferred)
}

/// 创建本次安装专用的临时挂载点，避免依赖 DMG 自带卷名（卷名可被攻击者控制）。
#[cfg(target_os = "macos")]
fn create_mount_point() -> Result<PathBuf, String> {
    use std::io::ErrorKind;

    let dir = std::env::temp_dir();
    for _ in 0..8 {
        let path = dir.join(format!("nervd_mount_{}", random_token()));
        match std::fs::create_dir(&path) {
            Ok(()) => return Ok(path),
            Err(e) if e.kind() == ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(format!("创建临时挂载点失败: {e}")),
        }
    }

    Err("创建临时挂载点失败: 无法生成唯一目录名".to_string())
}

/// 直接以 argv 传参调用 rm，不经过 shell，避免路径被拼接成命令。
#[cfg(target_os = "macos")]
fn remove_path(path: &Path) -> Result<(), String> {
    let status = std::process::Command::new("rm")
        .arg("-rf")
        .arg(path)
        .status()
        .map_err(|e| format!("清理旧版本失败: {e}"))?;
    if !status.success() {
        return Err(format!("清理旧版本失败 (rm {status})"));
    }
    Ok(())
}

/// 用 ditto 复制 .app 目录，完整保留资源分支与权限。
#[cfg(target_os = "macos")]
fn copy_app(src: &Path, dest: &Path) -> Result<(), String> {
    let output = std::process::Command::new("ditto")
        .arg(src)
        .arg(dest)
        .output()
        .map_err(|e| format!("执行 ditto 复制应用失败: {e}"))?;
    if !output.status.success() {
        return Err(format!(
            "复制应用到「应用程序」失败 (ditto {})",
            output.status
        ));
    }
    Ok(())
}

/// 从只读 DMG 挂载卷安装 .app：覆盖前先备份到 `nervd.app.bak`，失败可回滚。
#[cfg(target_os = "macos")]
fn install_from_volume(volume: &Path) -> Result<(), String> {
    let app_src = volume.join("nervd.app");
    let meta =
        std::fs::symlink_metadata(&app_src).map_err(|_| "安装包中未找到 nervd.app".to_string())?;
    if !meta.is_dir() {
        return Err("安装包中的 nervd.app 不是有效目录".to_string());
    }

    // 挂载点由本进程创建，这里再确认应用真实路径正好位于挂载点根目录下，防止路径穿越
    let canonical_src = app_src
        .canonicalize()
        .map_err(|e| format!("解析安装包路径失败: {e}"))?;
    let canonical_volume = volume
        .canonicalize()
        .map_err(|e| format!("解析挂载点失败: {e}"))?;
    if canonical_src.parent() != Some(canonical_volume.as_path()) {
        return Err("安装包内应用路径异常，已中止自动安装".to_string());
    }
    if !canonical_src.join("Contents/MacOS/nervd").exists() {
        return Err("安装包内应用结构与预期不符，已中止自动安装".to_string());
    }

    let target = Path::new("/Applications/nervd.app");
    let backup = Path::new("/Applications/nervd.app.bak");
    let had_previous = target.exists();

    if had_previous {
        remove_path(backup)?;
        copy_app(target, backup)?;
    }

    let install = (|| -> Result<(), String> {
        if target.exists() {
            remove_path(target)?;
        }
        copy_app(&canonical_src, target)?;
        if target.join("Contents/MacOS/nervd").exists() {
            Ok(())
        } else {
            Err("安装后应用结构校验失败".to_string())
        }
    })();

    if let Err(e) = install {
        // 安装失败时尽量用备份还原旧版本，避免用户失去可用的应用
        if had_previous && backup.exists() {
            let _ = remove_path(target);
            let _ = copy_app(backup, target);
        } else if !had_previous {
            // 首次安装失败时清掉可能残留的半成品，避免用户误启动损坏的应用
            let _ = remove_path(target);
        }
        return Err(e);
    }

    Ok(())
}

/// 挂载 DMG 并完成覆盖安装，结束时始终卸载镜像。
#[cfg(target_os = "macos")]
fn install_on_macos(dmg: &Path) -> Result<(), String> {
    let mount_dir = create_mount_point()?;

    let attach = std::process::Command::new("hdiutil")
        .args([
            "attach",
            "-nobrowse",
            "-readonly",
            "-noautoopen",
            "-mountpoint",
        ])
        .arg(&mount_dir)
        .arg(dmg)
        .output()
        .map_err(|e| format!("挂载安装包失败: {e}"))?;

    if !attach.status.success() {
        let stderr = String::from_utf8_lossy(&attach.stderr);
        let _ = std::fs::remove_dir(&mount_dir);
        return Err(format!("挂载安装包失败: {}", stderr.trim()));
    }

    let result = install_from_volume(&mount_dir);

    let detached = std::process::Command::new("hdiutil")
        .args(["detach", "-force"])
        .arg(&mount_dir)
        .status()
        .map(|status| status.success())
        .unwrap_or(false);
    if detached {
        let _ = std::fs::remove_dir(&mount_dir);
    }

    result
}

#[tauri::command]
pub async fn download_and_install_update(
    app: AppHandle,
    download_url: String,
) -> Result<bool, String> {
    use tauri::Emitter;

    // 1) 只接受 GitHub 官方 https 地址，避免 IPC 入参变成任意下载/安装入口
    let url = validate_update_url(&download_url)?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(600))
        .build()
        .map_err(|e| format!("创建下载客户端失败: {e}"))?;

    // 2) 随机临时名 + create_new 独占创建，避免符号链接攻击与固定路径覆盖
    let (file, installer_path) = create_temp_installer()?;
    let transferred = match stream_installer(&app, &client, url.as_str(), file).await {
        Ok(transferred) => transferred,
        Err(e) => {
            let _ = std::fs::remove_file(&installer_path);
            return Err(e);
        }
    };

    let _ = app.emit(
        "update-progress",
        UpdateProgressPayload {
            percent: 100.0,
            transferred_bytes: transferred,
            total_bytes: transferred,
            speed_bytes_per_sec: 0,
            status: "installing".to_string(),
            message: Some("下载完成，正在校验安装包完整性…".to_string()),
        },
    );

    // 3) SHA-256 完整性校验：校验文件缺失、格式异常或摘要不匹配时一律中止安装
    let verify_client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("创建校验客户端失败: {e}"))?;
    let expected = match fetch_expected_sha256(&verify_client, &url).await {
        Ok(hash) => hash,
        Err(e) => {
            let _ = std::fs::remove_file(&installer_path);
            return Err(e);
        }
    };
    let actual = match compute_sha256(&installer_path) {
        Ok(hash) => hash,
        Err(e) => {
            let _ = std::fs::remove_file(&installer_path);
            return Err(e);
        }
    };
    if actual != expected {
        let _ = std::fs::remove_file(&installer_path);
        return Err(format!(
            "安装包完整性校验失败（SHA-256 不匹配，期望 {expected}，实际 {actual}），已中止安装"
        ));
    }

    let _ = app.emit(
        "update-progress",
        UpdateProgressPayload {
            percent: 100.0,
            transferred_bytes: transferred,
            total_bytes: transferred,
            speed_bytes_per_sec: 0,
            status: "installing".to_string(),
            message: Some("校验通过，正在安装更新…".to_string()),
        },
    );

    #[cfg(target_os = "macos")]
    {
        // 不再调用 xattr -cr 剥离 com.apple.quarantine：隔离属性交由 Gatekeeper 与用户决定。
        // 自动覆盖安装失败时，打开安装包引导用户手动拖拽，并在 UI 提示「右键 → 打开」。
        match install_on_macos(&installer_path) {
            Ok(()) => {
                let _ = std::fs::remove_file(&installer_path);
                let _ = app.emit(
                    "update-progress",
                    UpdateProgressPayload {
                        percent: 100.0,
                        transferred_bytes: transferred,
                        total_bytes: transferred,
                        speed_bytes_per_sec: 0,
                        status: "done".to_string(),
                        message: Some("安装完成，应用正在重启…".to_string()),
                    },
                );
                // 等待旧进程退出后再拉起新版本
                tokio::time::sleep(Duration::from_millis(1000)).await;
                let _ = std::process::Command::new("open")
                    .arg("/Applications/nervd.app")
                    .status();
                tokio::time::sleep(Duration::from_millis(600)).await;
                app.exit(0);
                Ok(true)
            }
            Err(reason) => {
                let _ = std::process::Command::new("open")
                    .arg(&installer_path)
                    .spawn();
                let _ = app.emit(
                    "update-progress",
                    UpdateProgressPayload {
                        percent: 100.0,
                        transferred_bytes: transferred,
                        total_bytes: transferred,
                        speed_bytes_per_sec: 0,
                        status: "done".to_string(),
                        message: Some(format!(
                            "{reason}。已打开安装包，请手动将 nervd 拖入「应用程序」；若系统提示无法验证开发者，请在 nervd 上右键选择「打开」后重试"
                        )),
                    },
                );
                Ok(true)
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new(&installer_path)
            .arg("/SILENT")
            .spawn();
        let _ = app.emit(
            "update-progress",
            UpdateProgressPayload {
                percent: 100.0,
                transferred_bytes: transferred,
                total_bytes: transferred,
                speed_bytes_per_sec: 0,
                status: "done".to_string(),
                message: Some("安装程序已启动，应用即将退出并重启…".to_string()),
            },
        );
        tokio::time::sleep(Duration::from_millis(600)).await;
        app.exit(0);
        Ok(true)
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = app.emit(
            "update-progress",
            UpdateProgressPayload {
                percent: 100.0,
                transferred_bytes: transferred,
                total_bytes: transferred,
                speed_bytes_per_sec: 0,
                status: "done".to_string(),
                message: Some(format!("安装包已保存至: {}", installer_path.display())),
            },
        );
        Ok(true)
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

    #[test]
    fn test_validate_update_url_only_allows_github_https() {
        assert!(validate_update_url(
            "https://github.com/AZenking/nervd/releases/download/v1.1.2/nervd_1.1.2_aarch64.dmg"
        )
        .is_ok());
        assert!(validate_update_url(
            "https://objects.githubusercontent.com/github-production-release-asset/1?sig=abc"
        )
        .is_ok());
        assert!(validate_update_url("http://github.com/a.dmg").is_err());
        assert!(validate_update_url("https://evil.example/a.dmg").is_err());
        assert!(validate_update_url("https://github.com.evil.example/a.dmg").is_err());
        assert!(validate_update_url("https://evilgithubusercontent.com/a.dmg").is_err());
        assert!(validate_update_url("https://user:pass@github.com/a.dmg").is_err());
        assert!(validate_update_url("   ").is_err());
    }

    #[test]
    fn test_sha256_sidecar_url_and_digest_parsing() {
        let url = validate_update_url(
            "https://github.com/AZenking/nervd/releases/download/v1.1.2/nervd_1.1.2_aarch64.dmg",
        )
        .unwrap();
        assert_eq!(
            sha256_sidecar_url(&url).unwrap().as_str(),
            "https://github.com/AZenking/nervd/releases/download/v1.1.2/nervd_1.1.2_aarch64.dmg.sha256"
        );

        let digest = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
        assert_eq!(
            parse_sha256_hex(&format!("{digest}  nervd_1.1.2_aarch64.dmg\n")),
            Some(digest.to_string())
        );
        assert_eq!(parse_sha256_hex("not-a-hash  some.dmg"), None);
        assert_eq!(parse_sha256_hex(""), None);
    }

    #[test]
    fn test_compute_sha256_matches_known_digest() {
        let path = std::env::temp_dir().join(format!("nervd_sha256_{}.txt", random_token()));
        std::fs::write(&path, b"nervd").unwrap();
        let digest = compute_sha256(&path);
        let _ = std::fs::remove_file(&path);

        // echo -n nervd | shasum -a 256
        assert_eq!(
            digest.unwrap(),
            "518c692d4befa1c36415537b6aba009f09a84224d0381836ecf369affefad210"
        );
    }
}
