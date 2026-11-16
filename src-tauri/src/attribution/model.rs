//! 变更归属 IPC 契约（与前端的 `src/types/attribution.ts` 一一对应）。
//!
//! 该文件由 Lead 冻结：字段名/类型属于跨模块契约，subagent 不得改字段，
//! 只能在实现模块中消费。

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangeEvent {
    pub id: String,
    pub repo_id: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repo_name: Option<String>,
    /// commit | mr | build
    pub kind: String,
    pub external_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub branch: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_branch: Option<String>,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    pub occurred_at: i64,
    /// remote | local | ci
    pub source: String,
    pub pushed: bool,
    pub backfilled: bool,
    pub payload: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkitemChange {
    #[serde(flatten)]
    pub event: ChangeEvent,
    /// primary | related | rollup
    pub relation: String,
    /// explicit | branch | target | inherited | manual
    pub confidence: String,
    pub identifier: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workitem_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub activity_status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ChangePage {
    pub items: Vec<WorkitemChange>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_before: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncRepoReport {
    pub repo_id: i64,
    pub ok: bool,
    pub branches: u32,
    pub commits: u32,
    pub merge_requests: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SyncReport {
    pub started_at: i64,
    pub finished_at: i64,
    pub repos: Vec<SyncRepoReport>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttributionRepoStatus {
    pub repo_id: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_sync_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AttributionStatus {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_sync_at: Option<i64>,
    pub syncing: bool,
    pub repos: Vec<AttributionRepoStatus>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedWorkitemRef {
    pub identifier: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workitem_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subject: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_workitem_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_identifier: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityPolicy {
    pub enabled: bool,
    /// off | batch | per_event
    pub child_mode: String,
    /// off | milestone | daily
    pub parent_mode: String,
    pub max_per_day: u32,
}

impl Default for ActivityPolicy {
    fn default() -> Self {
        Self {
            enabled: true,
            child_mode: "batch".into(),
            parent_mode: "milestone".into(),
            max_per_day: 5,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityCandidate {
    pub event_id: String,
    pub workitem_id: String,
    pub identifier: String,
    pub relation: String,
    pub event: ChangeEvent,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub batch_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalRepoBinding {
    pub repo_id: i64,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remote_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_branch: Option<String>,
    pub hook_installed: bool,
    /// fill | enforce | off
    pub hook_mode: String,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalRepoInfo {
    pub path: String,
    pub is_git: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remote_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_branch: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub head_sha: Option<String>,
    pub dirty: bool,
    /// 钩子文件是否存在且由 nervd 管理（以实际文件为准，不信任数据库标记）
    pub hook_installed: bool,
    /// fill | enforce | off；未安装时为 off
    pub hook_mode: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hook_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveWorkitem {
    pub repo_id: i64,
    pub workitem_id: String,
    pub identifier: String,
    /// Req | Bug | Task
    pub category: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_workitem_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_identifier: Option<String>,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HookStatus {
    pub installed: bool,
    /// fill | enforce | off
    pub mode: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub backup_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchTrackTopology {
    pub track_id: String,
    /// null = legacy；"" = 不建子分支；其他 = 自定义模式
    pub child_pattern: Option<String>,
    /// requirement | baseline
    pub child_base: String,
    /// parent | baseline
    pub child_mr_target: String,
}

impl Default for BranchTrackTopology {
    fn default() -> Self {
        Self {
            track_id: String::new(),
            child_pattern: None,
            child_base: "requirement".into(),
            child_mr_target: "parent".into(),
        }
    }
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AttributionCoverage {
    pub total: u32,
    pub attributed: u32,
    pub unattributed: u32,
    pub ratio: f64,
}