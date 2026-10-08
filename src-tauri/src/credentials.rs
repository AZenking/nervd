//! 凭证与设置：PAT 存 macOS Keychain，设置存 app_data_dir/settings.json

use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::Manager;

pub const SERVICE: &str = "dev.nervd.app";
pub const ACCOUNT: &str = "yunxiao_pat";

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct JenkinsConnection {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub username: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(
    tag = "provider",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum RepoCiBinding {
    Flow {
        pipeline_id: i64,
        pipeline_name: String,
    },
    Jenkins {
        connection_id: String,
        job_full_name: String,
    },
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub organization_id: String,
    pub default_space_identifier: String,
    pub link_pattern: String,
    pub watched_repos: Vec<i64>,
    pub allow_write_ops: bool,
    pub workitem_repos: HashMap<String, Vec<i64>>,
    pub jenkins_connections: Vec<JenkinsConnection>,
    pub repo_ci_bindings: HashMap<i64, RepoCiBinding>,
}

pub const LEGACY_LINK_PATTERN: &str = r"(?:REQ|BUG|TASK)[-_]?(\d+)";
pub const DEFAULT_LINK_PATTERN: &str = r"([A-Za-z][A-Za-z0-9]{1,15}[-_]\d{1,})";

impl Default for Settings {
    fn default() -> Self {
        Self {
            organization_id: String::new(),
            default_space_identifier: String::new(),
            link_pattern: DEFAULT_LINK_PATTERN.to_string(),
            watched_repos: vec![],
            allow_write_ops: false,
            workitem_repos: HashMap::new(),
            jenkins_connections: vec![],
            repo_ci_bindings: HashMap::new(),
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
    let Ok(path) = settings_path(app) else {
        return Settings::default();
    };
    let Ok(text) = std::fs::read_to_string(path) else {
        return Settings::default();
    };
    let mut s: Settings = serde_json::from_str(&text).unwrap_or_default();
    // 一次性迁移：旧默认正则（REQ/BUG/TASK 前缀）→ 项目无关新默认
    if s.link_pattern == LEGACY_LINK_PATTERN {
        s.link_pattern = DEFAULT_LINK_PATTERN.to_string();
    }
    s
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
            Ok(_) => entry
                .delete_credential()
                .map_err(|e| format!("Keychain 删除失败: {e}")),
            Err(_) => Ok(()), // 本就不存在
        },
        Err(e) => Err(format!("Keychain 打开失败: {e}")),
    }
}

fn jenkins_account(connection_id: &str) -> Result<String, String> {
    let valid = !connection_id.is_empty()
        && connection_id.len() <= 80
        && connection_id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_');
    if !valid {
        return Err("Jenkins 实例 ID 格式无效".into());
    }
    Ok(format!("jenkins:{connection_id}"))
}

pub fn load_jenkins_token(connection_id: &str) -> Option<String> {
    let account = jenkins_account(connection_id).ok()?;
    Entry::new(SERVICE, &account).ok()?.get_password().ok()
}

pub fn has_jenkins_token(connection_id: &str) -> bool {
    load_jenkins_token(connection_id).is_some()
}

pub fn save_jenkins_token(connection_id: &str, token: &str) -> Result<(), String> {
    let account = jenkins_account(connection_id)?;
    let token = token.trim();
    if token.is_empty() {
        return Err("Jenkins API Token 不能为空".into());
    }
    let entry = Entry::new(SERVICE, &account).map_err(|e| format!("Keychain 打开失败: {e}"))?;
    entry
        .set_password(token)
        .map_err(|e| format!("Keychain 写入 Jenkins Token 失败: {e}"))
}

pub fn delete_jenkins_token(connection_id: &str) -> Result<(), String> {
    let account = jenkins_account(connection_id)?;
    match Entry::new(SERVICE, &account) {
        Ok(entry) => match entry.get_password() {
            Ok(_) => entry
                .delete_credential()
                .map_err(|e| format!("Keychain 删除 Jenkins Token 失败: {e}")),
            Err(_) => Ok(()),
        },
        Err(e) => Err(format!("Keychain 打开失败: {e}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_settings_load_with_empty_requirement_and_ci_maps() {
        let settings: Settings = serde_json::from_str(
            r#"{
                "organizationId":"org",
                "defaultSpaceIdentifier":"space",
                "linkPattern":"REQ-(\\d+)",
                "watchedRepos":[12, 13],
                "allowWriteOps":false
            }"#,
        )
        .unwrap();

        assert_eq!(settings.watched_repos, [12, 13]);
        assert!(settings.workitem_repos.is_empty());
        assert!(settings.jenkins_connections.is_empty());
        assert!(settings.repo_ci_bindings.is_empty());
    }

    #[test]
    fn settings_keep_explicit_empty_overrides_and_per_repo_ci_providers() {
        let settings: Settings = serde_json::from_str(
            r#"{
                "watchedRepos":[12],
                "workitemRepos":{"req-1":[],"req-2":[12,13]},
                "jenkinsConnections":[{"id":"jenkins-a","name":"A","baseUrl":"https://ci.example","username":"user"}],
                "repoCiBindings":{
                    "12":{"provider":"jenkins","connectionId":"jenkins-a","jobFullName":"folder/job"},
                    "13":{"provider":"flow","pipelineId":99,"pipelineName":"release"}
                }
            }"#,
        )
        .unwrap();

        assert!(settings.workitem_repos["req-1"].is_empty());
        assert_eq!(settings.workitem_repos["req-2"], [12, 13]);
        assert!(matches!(
            settings.repo_ci_bindings[&12],
            RepoCiBinding::Jenkins { .. }
        ));
        assert!(matches!(
            settings.repo_ci_bindings[&13],
            RepoCiBinding::Flow { .. }
        ));
    }
}
