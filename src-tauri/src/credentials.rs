//! 凭证与设置：PAT 存 macOS Keychain，设置存 app_data_dir/settings.json

use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

pub const SERVICE: &str = "dev.nervd.app";
pub const ACCOUNT: &str = "yunxiao_pat";

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub organization_id: String,
    pub default_space_identifier: String,
    pub link_pattern: String,
    pub watched_repos: Vec<i64>,
    pub allow_write_ops: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            organization_id: String::new(),
            default_space_identifier: String::new(),
            link_pattern: r"(?:REQ|BUG|TASK)[-_]?(\d+)".to_string(),
            watched_repos: vec![],
            allow_write_ops: false,
        }
    }
}

pub fn settings_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法定位应用数据目录: {e}"))?;
    Ok(dir.join("settings.json"))
}

pub fn load_settings(app: &tauri::AppHandle) -> Settings {
    let Ok(path) = settings_path(app) else { return Settings::default() };
    let Ok(text) = std::fs::read_to_string(path) else { return Settings::default() };
    serde_json::from_str(&text).unwrap_or_default()
}

pub fn save_settings(app: &tauri::AppHandle, s: &Settings) -> Result<(), String> {
    let path = settings_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建数据目录失败: {e}"))?;
    }
    let text = serde_json::to_string_pretty(s).map_err(|e| format!("序列化失败: {e}"))?;
    std::fs::write(path, text).map_err(|e| format!("写入设置失败: {e}"))
}

pub fn load_pat() -> Option<String> {
    Entry::new(SERVICE, ACCOUNT).ok()?.get_password().ok()
}

pub fn save_pat(pat: &str) -> Result<(), String> {
    let entry = Entry::new(SERVICE, ACCOUNT).map_err(|e| format!("Keychain 打开失败: {e}"))?;
    entry
        .set_password(pat.trim())
        .map_err(|e| format!("Keychain 写入失败: {e}"))
}

pub fn delete_pat() -> Result<(), String> {
    match Entry::new(SERVICE, ACCOUNT) {
        Ok(entry) => match entry.get_password() {
            Ok(_) => entry.delete_credential().map_err(|e| format!("Keychain 删除失败: {e}")),
            Err(_) => Ok(()), // 本就不存在
        },
        Err(e) => Err(format!("Keychain 打开失败: {e}")),
    }
}
