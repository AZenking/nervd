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

/// 工作项相关人员（负责人 / 协同人 / 创建人）。
///
/// 仅用于本地写回范围判定（`attribution` 内部），不进入 IPC 输出：
/// 前端只依赖 `ResolvedWorkitemRef` 原有字段，避免扩大冻结契约。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkitemPerson {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

impl WorkitemPerson {
    pub fn is_empty(&self) -> bool {
        self.id.as_deref().unwrap_or("").trim().is_empty()
            && self.name.as_deref().unwrap_or("").trim().is_empty()
    }
}

/// 「我」的身份：写回只处理负责人是我的工作项。
///
/// - `id`：云效平台用户 ID（`assignedTo.id`）
/// - `name`：姓名 / 花名（`assignedTo.name`）
/// - `aliases`：用户在设置里声明的别名（`workitemHighlight.customName`），只在姓名匹配时生效
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewerIdentity {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub aliases: Vec<String>,
}

impl ViewerIdentity {
    /// 既没有 ID 也没有姓名时无法判定「我的」，写回必须 fail-closed。
    pub fn is_effective(&self) -> bool {
        let id = self.id.as_deref().unwrap_or("").trim();
        let name = self.name.as_deref().unwrap_or("").trim();
        !id.is_empty() || !name.is_empty()
    }

    /// 用于 SQL `IN (...)` 的姓名候选：姓名 + 最多 4 个别名（去空、去重）。
    pub fn name_candidates(&self) -> Vec<String> {
        let mut names: Vec<String> = Vec::new();
        if let Some(name) = self.name.as_deref() {
            let name = name.trim();
            if !name.is_empty() {
                names.push(name.to_string());
            }
        }
        for alias in &self.aliases {
            let alias = alias.trim();
            if !alias.is_empty() && !names.iter().any(|existing| existing == alias) {
                names.push(alias.to_string());
            }
        }
        names.truncate(5);
        names
    }
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
    /// 负责人（写回范围判定用；不进入 IPC 输出）
    #[serde(default, skip_serializing)]
    pub assigned_to: Option<WorkitemPerson>,
    /// 创建人（父需求「与我相关」判定用；不进入 IPC 输出）
    #[serde(default, skip_serializing)]
    pub creator: Option<WorkitemPerson>,
    /// 协同人（父需求「与我相关」判定用；不进入 IPC 输出）
    #[serde(default, skip_serializing)]
    pub participants: Vec<WorkitemPerson>,
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