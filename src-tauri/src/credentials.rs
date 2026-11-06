//! 凭证与设置：PAT 存 macOS Keychain，设置存 com.dev.nervd.data/settings.json

use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tauri::Manager;

pub const SERVICE: &str = "dev.nervd.app";
pub const ACCOUNT: &str = "yunxiao_pat";

pub const STORAGE_DIR_NAME: &str = "com.dev.nervd.data";
pub const LEGACY_STORAGE_DIR_NAME: &str = "dev.nervd.app";

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
        #[serde(default)]
        branch_parameter: Option<String>,
        #[serde(default)]
        parameters: HashMap<String, String>,
    },
    Jenkins {
        connection_id: String,
        job_full_name: String,
        #[serde(default)]
        parameters: HashMap<String, String>,
        #[serde(default)]
        environment_parameter: Option<String>,
        #[serde(default)]
        branch_parameter: Option<String>,
    },
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BranchRuleTemplate {
    pub id: String,
    pub name: String,
    pub source_branch: String,
    pub baseline_branch_pattern: String,
    pub workitem_branch_pattern: String,
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
    pub branch_rule_templates: Vec<BranchRuleTemplate>,
    pub workitem_repo_branch_templates: HashMap<String, HashMap<i64, String>>,
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
            branch_rule_templates: vec![],
            workitem_repo_branch_templates: HashMap::new(),
            jenkins_connections: vec![],
            repo_ci_bindings: HashMap::new(),
        }
    }
}

pub fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base_dir = app
        .path()
        .data_dir()
        .or_else(|_| {
            app.path().app_data_dir().and_then(|p| {
                p.parent()
                    .map(|p| p.to_path_buf())
                    .ok_or_else(|| tauri::Error::UnknownPath)
            })
        })
        .map_err(|e| format!("无法定位系统数据目录: {e}"))?;

    let target = base_dir.join(STORAGE_DIR_NAME);
    std::fs::create_dir_all(&target).map_err(|e| format!("创建数据目录失败: {e}"))?;
    Ok(target)
}

pub fn legacy_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .or_else(|_| {
            app.path()
                .data_dir()
                .map(|p| p.join(LEGACY_STORAGE_DIR_NAME))
        })
        .map_err(|e| format!("无法定位旧数据目录: {e}"))
}

pub fn migrate_file_if_needed(legacy_path: &Path, target_path: &Path) {
    if legacy_path.is_file() && !target_path.exists() {
        if let Some(parent) = target_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Err(e) = std::fs::copy(legacy_path, target_path) {
            eprintln!(
                "迁移配置文件失败 (从 {} 到 {}): {e}",
                legacy_path.display(),
                target_path.display()
            );
            if target_path.exists() {
                let _ = std::fs::remove_file(target_path);
            }
        }
    }
}

pub fn settings_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = data_dir(app)?;
    let target = dir.join("settings.json");

    if let Ok(legacy_dir) = legacy_data_dir(app) {
        let legacy_file = legacy_dir.join("settings.json");
        migrate_file_if_needed(&legacy_file, &target);
    }

    Ok(target)
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
        assert!(settings.branch_rule_templates.is_empty());
        assert!(settings.workitem_repo_branch_templates.is_empty());
        assert!(settings.jenkins_connections.is_empty());
        assert!(settings.repo_ci_bindings.is_empty());
    }

    #[test]
    fn branch_templates_and_requirement_repo_selection_use_camel_case_settings_contract() {
        let settings: Settings = serde_json::from_str(
            r##"{
                "branchRuleTemplates": [{
                    "id": "site-b",
                    "name": "B 局点",
                    "sourceBranch": "test",
                    "baselineBranchPattern": "iteration/{iteration}/site-b",
                    "workitemBranchPattern": "feature/{identifier}"
                }],
                "workitemRepoBranchTemplates": {
                    "workitem-1": { "12": "site-b" }
                }
            }"##,
        )
        .unwrap();

        assert_eq!(settings.branch_rule_templates[0].source_branch, "test");
        assert_eq!(
            settings.workitem_repo_branch_templates["workitem-1"][&12],
            "site-b",
        );

        let encoded = serde_json::to_value(settings).unwrap();
        assert_eq!(
            encoded["branchRuleTemplates"][0]["baselineBranchPattern"],
            "iteration/{iteration}/site-b",
        );
        assert_eq!(
            encoded["workitemRepoBranchTemplates"]["workitem-1"]["12"],
            "site-b",
        );
    }

    #[test]
    fn removed_iteration_branch_configs_are_ignored_and_not_written_back() {
        let settings: Settings = serde_json::from_str(
            r#"{
                "iterationBranchConfigs": {
                    "sprint-1": {
                        "additionalRepoIds": [12],
                        "relations": {
                            "13": { "sourceBranch": "develop", "targetBranch": "iteration/sprint-1" }
                        }
                    }
                }
            }"#,
        )
        .unwrap();

        let encoded = serde_json::to_value(settings).unwrap();
        assert!(encoded.get("iterationBranchConfigs").is_none());
        assert!(encoded["branchRuleTemplates"]
            .as_array()
            .unwrap()
            .is_empty());
        assert!(encoded["workitemRepoBranchTemplates"]
            .as_object()
            .unwrap()
            .is_empty());
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

    #[test]
    fn test_migrate_file_if_needed_copies_when_target_missing() {
        let unique_id = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let test_dir = std::env::temp_dir().join(format!("nervd_test_migration_{unique_id}"));
        let legacy_dir = test_dir.join(LEGACY_STORAGE_DIR_NAME);
        let new_dir = test_dir.join(STORAGE_DIR_NAME);
        std::fs::create_dir_all(&legacy_dir).unwrap();

        let legacy_file = legacy_dir.join("settings.json");
        let target_file = new_dir.join("settings.json");

        let sample_content = r#"{"organizationId":"test-org","linkPattern":"TEST-(\\d+)"}"#;
        std::fs::write(&legacy_file, sample_content).unwrap();

        migrate_file_if_needed(&legacy_file, &target_file);

        assert!(target_file.exists());
        let migrated_content = std::fs::read_to_string(&target_file).unwrap();
        assert_eq!(migrated_content, sample_content);
        assert!(legacy_file.exists(), "旧文件应当完好保留作为备份");

        let _ = std::fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_migrate_file_if_needed_does_not_overwrite_existing_target() {
        let unique_id = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let test_dir = std::env::temp_dir().join(format!("nervd_test_migration_noop_{unique_id}"));
        let legacy_dir = test_dir.join(LEGACY_STORAGE_DIR_NAME);
        let new_dir = test_dir.join(STORAGE_DIR_NAME);
        std::fs::create_dir_all(&legacy_dir).unwrap();
        std::fs::create_dir_all(&new_dir).unwrap();

        let legacy_file = legacy_dir.join("settings.json");
        let target_file = new_dir.join("settings.json");

        std::fs::write(&legacy_file, "legacy content").unwrap();
        std::fs::write(&target_file, "existing target content").unwrap();

        migrate_file_if_needed(&legacy_file, &target_file);

        let final_content = std::fs::read_to_string(&target_file).unwrap();
        assert_eq!(
            final_content, "existing target content",
            "已存在的目标文件不应被旧文件覆盖"
        );

        let _ = std::fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_migrate_file_if_needed_handles_missing_legacy_gracefully() {
        let unique_id = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let test_dir = std::env::temp_dir().join(format!("nervd_test_migration_missing_{unique_id}"));
        let legacy_file = test_dir.join("nonexistent_dir").join("settings.json");
        let target_file = test_dir.join(STORAGE_DIR_NAME).join("settings.json");

        migrate_file_if_needed(&legacy_file, &target_file);

        assert!(!target_file.exists(), "若旧文件不存在，不应生成新文件");

        let _ = std::fs::remove_dir_all(&test_dir);
    }
}
