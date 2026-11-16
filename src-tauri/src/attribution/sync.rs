//! 仓库中心增量同步。
//!
//! 流程：目标仓库合并 → 分支轮转 → 提交/MR/本地提交 → 标识符批量解析 → 归属落库。
//! 约束：
//! - 网络请求先做完，再一次性拿 DB 锁写入（锁内不 await）；
//! - 单仓库/单分支失败不阻断其它仓库，错误中文化写回 `repo_sync_state`；
//! - `state.sync_inflight` 防重入，同仓库并发调用直接跳过。

use crate::attribution::model::{ResolvedWorkitemRef, SyncRepoReport, SyncReport};
use crate::attribution::{refs, store};
use crate::credentials::Settings;
use crate::yunxiao::YunxiaoClient;
use crate::AppState;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use tauri::Emitter;

/// Codeup oapi/v1 分页大小（上限 100）
const PER_PAGE: i64 = 100;
/// 首次同步回填窗口
const BACKFILL_DAYS: i64 = 30;
/// 首次同步每分支最多回填 500 条（5 页 × 100）
const BACKFILL_MAX_PER_BRANCH: usize = 500;
/// 每轮每仓库最多扫 20 个分支（轮转覆盖）
const MAX_BRANCHES_PER_REPO: usize = 20;
/// 分页安全上限（分支 / MR）
const MAX_PAGES: i64 = 50;
/// 单仓库单轮最多解析多少个编号（避免首次同步打爆工作项搜索接口）
const MAX_IDENTIFIERS_PER_REPO: usize = 200;
/// 单批编号解析上限
const MAX_RESOLVE_BATCH: usize = 50;
/// 分支轮转游标在 `repo_sync_state.ref` 里的键
const ROTATION_REF: &str = "__branch_rotation__";
/// 仓库级状态（last_sync / last_error / 最新分支游标）在 `repo_sync_state.ref` 里的键
const REPO_STATE_REF: &str = "*";

// ---------------------------------------------------------------------------
// 同步入口
// ---------------------------------------------------------------------------

/// 同步入口（供 `sync_attribution` 命令与本地仓库命令复用）。
///
/// `repo_ids = None` 表示同步所有目标仓库；`full = true` 表示忽略游标重新回填。
pub async fn sync_repos(
    state: &AppState,
    repo_ids: Option<Vec<i64>>,
    full: bool,
    app: Option<&tauri::AppHandle>,
) -> Result<SyncReport, String> {
    let started_at = store::now_ms();
    let (client, settings) = snapshot_optional(state);
    if let Some(ids) = &repo_ids {
        if ids.is_empty() {
            return Err("仓库 ID 列表不能为空".into());
        }
        if ids.iter().any(|id| *id <= 0) {
            return Err("仓库 ID 无效".into());
        }
    }
    // 无令牌/组织时仍允许「仅本地提交」同步（供 sync_local_repo 离线降级），
    // 但全量同步必须配置远端。
    let remote_ready = client.is_some() && !settings.organization_id.trim().is_empty();
    if !remote_ready && repo_ids.is_none() {
        return Err(if client.is_none() {
            "NOT_CONFIGURED: 请先在设置中保存个人访问令牌".into()
        } else {
            "NOT_CONFIGURED: 请先在设置中填写组织 ID".into()
        });
    }
    if remote_ready {
        // 正则写坏时分支/提交会静默无归属，这里前置失败并给出可读错误
        refs::validate_link_pattern(&settings.link_pattern)?;
    }

    let targets = target_repo_ids(state, &settings, repo_ids.as_deref())?;
    let mut report = SyncReport {
        started_at,
        finished_at: 0,
        repos: Vec::new(),
    };
    let mut touched_workitems: HashSet<String> = HashSet::new();
    let mut touched_repos: Vec<i64> = Vec::new();

    for repo_id in targets {
        let Some(guard) = InflightGuard::acquire(state, repo_id) else {
            report.repos.push(SyncRepoReport {
                repo_id,
                ok: false,
                branches: 0,
                commits: 0,
                merge_requests: 0,
                error: Some(format!("仓库 {repo_id} 正在同步中，已跳过")),
            });
            continue;
        };
        let result = sync_one_repo(
            state,
            client.as_deref(),
            &settings,
            repo_id,
            full,
            remote_ready,
            &mut touched_workitems,
        )
        .await;
        drop(guard);
        match result {
            Ok(repo_report) => {
                // 即使个别分支/MR 失败，本仓库已写入的事件也应触发前端刷新
                touched_repos.push(repo_id);
                report.repos.push(repo_report);
            }
            Err(error) => {
                // 错误落库，下一轮状态查询可见
                if let Ok(conn) = state.db.lock() {
                    let _ = store::save_sync_state(
                        &conn,
                        repo_id,
                        REPO_STATE_REF,
                        None,
                        None,
                        store::now_ms(),
                        Some(&error),
                    );
                }
                report.repos.push(SyncRepoReport {
                    repo_id,
                    ok: false,
                    branches: 0,
                    commits: 0,
                    merge_requests: 0,
                    error: Some(error),
                });
            }
        }
    }

    report.finished_at = store::now_ms();
    if let Some(app) = app {
        let mut workitem_ids: Vec<String> = touched_workitems.into_iter().collect();
        workitem_ids.sort();
        touched_repos.sort_unstable();
        touched_repos.dedup();
        let _ = app.emit(
            "attribution-updated",
            json!({ "workitemIds": workitem_ids, "repoIds": touched_repos }),
        );
    }
    Ok(report)
}

/// 读取客户端（可能未配置）与设置快照；两者都不跨 await 持锁。
fn snapshot_optional(state: &AppState) -> (Option<std::sync::Arc<YunxiaoClient>>, Settings) {
    let client = state.client.lock().unwrap().clone();
    let settings = state.settings.lock().unwrap().clone();
    (client, settings)
}

fn snapshot(state: &AppState) -> Result<(std::sync::Arc<YunxiaoClient>, Settings), String> {
    let (client, settings) = snapshot_optional(state);
    let client =
        client.ok_or_else(|| "NOT_CONFIGURED: 请先在设置中保存个人访问令牌".to_string())?;
    Ok((client, settings))
}

/// 目标仓库 = watchedRepos ∪ workitemRepos 的所有 repo ∪ 本地绑定 repo。
fn target_repo_ids(
    state: &AppState,
    settings: &Settings,
    filter: Option<&[i64]>,
) -> Result<Vec<i64>, String> {
    let local_ids = {
        let conn = state.db.lock().unwrap();
        store::local_binding_repo_ids(&conn)?
    };
    Ok(union_target_repo_ids(
        &settings.watched_repos,
        &settings.workitem_repos,
        &local_ids,
        filter,
    ))
}

fn union_target_repo_ids(
    watched: &[i64],
    workitem_repos: &HashMap<String, Vec<i64>>,
    local_ids: &[i64],
    filter: Option<&[i64]>,
) -> Vec<i64> {
    let mut ids: Vec<i64> = watched
        .iter()
        .copied()
        .chain(
            workitem_repos
                .values()
                .flat_map(|repos| repos.iter().copied()),
        )
        .chain(local_ids.iter().copied())
        .filter(|id| *id > 0)
        .collect();
    if let Some(filter) = filter {
        ids.retain(|id| filter.contains(id));
    }
    ids.sort_unstable();
    ids.dedup();
    ids
}

struct InflightGuard {
    state: AppState,
    repo_id: i64,
}

impl InflightGuard {
    fn acquire(state: &AppState, repo_id: i64) -> Option<Self> {
        let mut inflight = state.sync_inflight.lock().unwrap();
        if !inflight.insert(repo_id) {
            return None;
        }
        Some(Self {
            state: state.clone(),
            repo_id,
        })
    }
}

impl Drop for InflightGuard {
    fn drop(&mut self) {
        if let Ok(mut inflight) = self.state.sync_inflight.lock() {
            inflight.remove(&self.repo_id);
        }
    }
}

// ---------------------------------------------------------------------------
// 单仓库同步
// ---------------------------------------------------------------------------

#[allow(clippy::too_many_arguments)]
async fn sync_one_repo(
    state: &AppState,
    client: Option<&YunxiaoClient>,
    settings: &Settings,
    repo_id: i64,
    full: bool,
    remote_ready: bool,
    touched_workitems: &mut HashSet<String>,
) -> Result<SyncRepoReport, String> {
    let org = settings.organization_id.trim();
    let link_pattern = settings.link_pattern.as_str();
    let now = store::now_ms();

    let (binding, rotation, backfilled_at) = {
        let conn = state.db.lock().unwrap();
        let binding = store::get_local_binding(&conn, repo_id)?;
        let rotation = store::get_sync_state(&conn, repo_id, ROTATION_REF)?
            .and_then(|state| state.cursor)
            .and_then(|cursor| cursor.parse::<i64>().ok())
            .unwrap_or(0);
        let backfilled_at = store::get_sync_state(&conn, repo_id, REPO_STATE_REF)?
            .and_then(|state| state.backfilled_at);
        (binding, rotation, backfilled_at)
    };
    let first_sync = full || backfilled_at.is_none();
    let default_since = now - BACKFILL_DAYS * 86_400_000;

    if !remote_ready && binding.is_none() {
        return Ok(SyncRepoReport {
            repo_id,
            ok: false,
            branches: 0,
            commits: 0,
            merge_requests: 0,
            error: Some("未配置访问令牌/组织 ID，且该仓库没有绑定本地路径".into()),
        });
    }

    let mut drafts: Vec<DraftEvent> = Vec::new();
    let mut branch_cursors: Vec<(String, i64)> = Vec::new();
    let mut branch_errors: Vec<(String, String)> = Vec::new();
    let mut errors: Vec<String> = Vec::new();
    let mut note: Option<String> = None;
    let mut next_rotation = rotation;
    let mut branch_count = 0_usize;

    if remote_ready {
        let Some(client) = client else {
            return Err("内部错误：远端已就绪但缺少客户端".into());
        };
        // 1) 分支：全量拉取 → linkPattern 过滤 → committedDate 倒序 → 每轮 20 个轮转
        let branches = match fetch_branches(client, org, repo_id).await {
            Ok(branches) => branches,
            Err(error) => {
                errors.push(error);
                Vec::new()
            }
        };
        let mut matched: Vec<BranchRow> = branches
            .into_iter()
            .filter(|branch| refs::branch_owner(&branch.name, link_pattern).is_some())
            .collect();
        matched.sort_by(|left, right| {
            right
                .committed_at
                .cmp(&left.committed_at)
                .then_with(|| left.name.cmp(&right.name))
        });
        let total = matched.len();
        let start = if total == 0 {
            0
        } else {
            (rotation.max(0) as usize) % total
        };
        let selected: Vec<BranchRow> = matched
            .iter()
            .skip(start)
            .chain(matched.iter().take(start))
            .take(MAX_BRANCHES_PER_REPO)
            .cloned()
            .collect();
        next_rotation = if total == 0 {
            0
        } else {
            ((start + selected.len()) % total) as i64
        };
        branch_count = selected.len();

        for branch in &selected {
            // 首次同步或从未见过的新分支都按回填处理（历史动态不补写）
            let (since, branch_backfill) = if first_sync {
                (default_since, true)
            } else {
                let cursor = {
                    let conn = state.db.lock().unwrap();
                    store::get_sync_state(&conn, repo_id, &branch.name)?
                };
                match cursor
                    .and_then(|state| state.cursor)
                    .and_then(|cursor| cursor.parse::<i64>().ok())
                {
                    Some(cursor) => (cursor - 86_400_000, false),
                    None => (default_since, true),
                }
            };
            match fetch_commits(client, org, repo_id, &branch.name, since, branch_backfill).await {
                Ok(commits) => {
                    let mut newest = 0_i64;
                    for commit in &commits {
                        newest = newest.max(commit.committed_at);
                        drafts.push(commit_draft(
                            repo_id,
                            branch,
                            commit,
                            settings,
                            branch_backfill,
                        ));
                    }
                    if newest > 0 {
                        branch_cursors.push((branch.name.clone(), newest));
                    }
                }
                Err(error) => {
                    errors.push(error.clone());
                    branch_errors.push((branch.name.clone(), error));
                }
            }
        }

        // 2) MR：按 localId upsert，sourceBranch owner = primary，targetBranch owner = related
        match fetch_merge_requests(client, org, repo_id).await {
            Ok(requests) => {
                for request in &requests {
                    if let Some(draft) = mr_draft(repo_id, request, settings, first_sync) {
                        drafts.push(draft);
                    }
                }
            }
            Err(error) => errors.push(error),
        }
    } else {
        note = Some("未配置访问令牌/组织 ID，已仅同步本地提交".into());
    }

    // 3) 本地绑定仓库：source=local / pushed=false（远端同 SHA 会在 upsert 时翻 true）
    if let Some(binding) = &binding {
        match crate::local_repo::read_local_commits(
            &binding.path,
            binding.default_branch.as_deref(),
            None,
        ) {
            Ok(commits) => {
                for commit in commits.into_iter().take(BACKFILL_MAX_PER_BRANCH) {
                    drafts.push(local_commit_draft(repo_id, binding, commit, settings));
                }
            }
            Err(error) => errors.push(format!("读取本地仓库 {} 失败: {error}", binding.path)),
        }
    }

    // 同一提交可能出现在多个分支（合并/基线），按事件 ID 去重
    let mut seen: HashSet<String> = HashSet::new();
    drafts.retain(|draft| seen.insert(draft.id.clone()));

    // 4) 标识符批量解析（缓存优先，最多 50/批）
    let mut identifiers: Vec<String> = Vec::new();
    for draft in &drafts {
        for attribution in &draft.attributions {
            if !identifiers.contains(&attribution.identifier) {
                identifiers.push(attribution.identifier.clone());
            }
        }
    }
    identifiers.truncate(MAX_IDENTIFIERS_PER_REPO);
    let resolved: HashMap<String, ResolvedWorkitemRef> =
        match resolve_workitem_identifiers(state, &identifiers).await {
            Ok(references) => references
                .into_iter()
                .map(|reference| (reference.identifier.clone(), reference))
                .collect(),
            Err(error) => {
                // 解析失败不阻塞索引：事件照常入库，进入待归属
                eprintln!("[attribution] 仓库 {repo_id} 编号解析失败，事件进入待归属: {error}");
                HashMap::new()
            }
        };

    // 5) 归属（含 rollup）→ 落库
    let mut prepared: Vec<(DraftEvent, Vec<StoredLink>)> = Vec::with_capacity(drafts.len());
    for mut draft in drafts {
        let links = build_links(&mut draft.attributions, &resolved);
        prepared.push((draft, links));
    }

    let mut touched: HashSet<String> = HashSet::new();
    {
        let conn = state.db.lock().unwrap();
        let transaction = conn
            .unchecked_transaction()
            .map_err(|e| format!("开启仓库 {repo_id} 索引事务失败: {e}"))?;
        for (draft, links) in &prepared {
            let input = store::EventInput {
                id: &draft.id,
                repo_id: draft.repo_id,
                kind: draft.kind,
                external_id: &draft.external_id,
                branch: draft.branch.as_deref(),
                target_branch: draft.target_branch.as_deref(),
                title: &draft.title,
                author: draft.author.as_deref(),
                occurred_at: draft.occurred_at,
                source: draft.source,
                pushed: draft.pushed,
                backfilled: draft.backfilled,
                payload: &draft.payload,
            };
            store::upsert_event(&transaction, &input)?;
            for link in links {
                if let Some(workitem_id) = &link.workitem_id {
                    touched.insert(workitem_id.clone());
                }
            }
            // 人工指派优先于自动规则，重同步不得覆盖
            if store::has_manual_attribution(&transaction, &draft.id)? {
                continue;
            }
            let link_inputs: Vec<store::WorkitemLinkInput<'_>> = links
                .iter()
                .map(|link| store::WorkitemLinkInput {
                    identifier: &link.identifier,
                    workitem_id: link.workitem_id.as_deref(),
                    relation: &link.relation,
                    confidence: &link.confidence,
                })
                .collect();
            store::replace_event_workitems(&transaction, &draft.id, &link_inputs)?;
            if draft.backfilled {
                store::mark_event_activity_skipped(&transaction, &draft.id)?;
            }
        }
        for (branch, cursor) in &branch_cursors {
            store::save_sync_state(
                &transaction,
                repo_id,
                branch,
                Some(&cursor.to_string()),
                if first_sync { Some(now) } else { None },
                now,
                None,
            )?;
        }
        for (branch, error) in &branch_errors {
            store::save_sync_state(&transaction, repo_id, branch, None, None, now, Some(error))?;
        }
        let max_cursor = branch_cursors
            .iter()
            .map(|(_, cursor)| *cursor)
            .max()
            .map(|cursor| cursor.to_string());
        let overall_error = if errors.is_empty() {
            None
        } else {
            Some(truncate_join(&errors, 3))
        };
        store::save_sync_state(
            &transaction,
            repo_id,
            ROTATION_REF,
            Some(&next_rotation.to_string()),
            None,
            now,
            None,
        )?;
        store::save_sync_state(
            &transaction,
            repo_id,
            REPO_STATE_REF,
            max_cursor.as_deref(),
            if first_sync && errors.is_empty() && branch_errors.is_empty() {
                Some(now)
            } else {
                None
            },
            now,
            overall_error.as_deref(),
        )?;
        transaction
            .commit()
            .map_err(|e| format!("提交仓库 {repo_id} 索引事务失败: {e}"))?;
    }
    touched_workitems.extend(touched);

    let commits = prepared
        .iter()
        .filter(|(draft, _)| draft.kind == "commit")
        .count() as u32;
    let merge_requests = prepared
        .iter()
        .filter(|(draft, _)| draft.kind == "mr")
        .count() as u32;
    let ok = errors.is_empty() && branch_errors.is_empty();
    let error = if errors.is_empty() && branch_errors.is_empty() {
        note
    } else {
        let mut messages = errors.clone();
        messages.extend(
            branch_errors
                .iter()
                .map(|(branch, error)| format!("分支 {branch}: {error}")),
        );
        Some(truncate_join(&messages, 3))
    };
    Ok(SyncRepoReport {
        repo_id,
        ok,
        branches: branch_count as u32,
        commits,
        merge_requests,
        error,
    })
}

fn truncate_join(messages: &[String], max: usize) -> String {
    let mut parts: Vec<String> = messages.iter().take(max).cloned().collect();
    if messages.len() > max {
        parts.push(format!("等 {} 项错误", messages.len()));
    }
    parts.join("；")
}

// ---------------------------------------------------------------------------
// 网络拉取
// ---------------------------------------------------------------------------

fn as_array(value: &Value) -> Vec<Value> {
    match value {
        Value::Array(items) => items.clone(),
        Value::Object(_) => {
            for key in ["result", "items", "data", "changeRequests"] {
                if let Some(items) = value.get(key).and_then(Value::as_array) {
                    return items.clone();
                }
            }
            Vec::new()
        }
        _ => Vec::new(),
    }
}

fn s(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn s2(value: &Value, first: &str, second: &str) -> String {
    let text = s(value, first);
    if text.is_empty() {
        s(value, second)
    } else {
        text
    }
}

fn nested_s(value: &Value, outer: &str, inner: &str) -> String {
    value
        .get(outer)
        .and_then(|nested| nested.get(inner))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

/// 搜索行里的类别字段归一到契约值 `Req` / `Bug` / `Task`。
fn normalize_category(raw: &str) -> Option<&'static str> {
    match raw.trim().to_ascii_lowercase().as_str() {
        "req" | "requirement" => Some("Req"),
        "bug" => Some("Bug"),
        "task" => Some("Task"),
        _ => None,
    }
}

fn i64_value(value: &Value, key: &str) -> Option<i64> {
    match value.get(key) {
        Some(Value::Number(number)) => number.as_i64(),
        Some(Value::String(text)) => text.trim().parse::<i64>().ok(),
        _ => None,
    }
}

/// 统一换算成 epoch 毫秒：< 1e11 视为秒（当前秒级时间戳约 1.8e9），否则原样返回。
fn normalize_epoch(value: i64) -> i64 {
    if value > 0 && value < 100_000_000_000 {
        value.saturating_mul(1000)
    } else {
        value
    }
}

/// 解析云效时间：RFC3339 / `YYYY-MM-DD HH:MM:SS` / `YYYY-MM-DD` / epoch（秒或毫秒）。
///
/// 无时区的朴素时间按 UTC 处理（宁可多回看 8 小时，也不漏提交）。
fn parse_api_time(value: Option<&Value>) -> i64 {
    match value {
        Some(Value::Number(number)) => normalize_epoch(number.as_i64().unwrap_or(0)),
        Some(Value::String(text)) => parse_time_text(text),
        _ => 0,
    }
}

fn parse_time_text(text: &str) -> i64 {
    let text = text.trim();
    if text.is_empty() {
        return 0;
    }
    if let Ok(datetime) = chrono::DateTime::parse_from_rfc3339(text) {
        return datetime.timestamp().saturating_mul(1000);
    }
    for format in ["%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"] {
        if let Ok(naive) = chrono::NaiveDateTime::parse_from_str(text, format) {
            return naive.and_utc().timestamp().saturating_mul(1000);
        }
    }
    if let Ok(date) = chrono::NaiveDate::parse_from_str(text, "%Y-%m-%d") {
        if let Some(naive) = date.and_hms_opt(0, 0, 0) {
            return naive.and_utc().timestamp().saturating_mul(1000);
        }
    }
    if let Ok(number) = text.parse::<i64>() {
        return normalize_epoch(number);
    }
    0
}

/// epoch 毫秒 → 云效 `start` 参数（UTC `YYYY-MM-DD HH:MM:SS`）。
fn format_api_time(epoch_ms: i64) -> String {
    chrono::DateTime::from_timestamp(epoch_ms.div_euclid(1000), 0)
        .map(|datetime| datetime.format("%Y-%m-%d %H:%M:%S").to_string())
        .unwrap_or_default()
}

#[derive(Debug, Clone)]
struct BranchRow {
    name: String,
    committed_at: i64,
}

async fn fetch_branches(
    client: &YunxiaoClient,
    org: &str,
    repo_id: i64,
) -> Result<Vec<BranchRow>, String> {
    let path = format!("/oapi/v1/codeup/organizations/{org}/repositories/{repo_id}/branches");
    let mut branches = Vec::new();
    for page in 1..=MAX_PAGES {
        let query = vec![
            ("page", page.to_string()),
            ("perPage", PER_PAGE.to_string()),
        ];
        let response = client
            .get(&path, &query)
            .await
            .map_err(|e| format!("拉取仓库 {repo_id} 分支失败: {e}"))?;
        let rows = as_array(&response);
        let count = rows.len();
        for row in &rows {
            let name = s2(row, "name", "branchName");
            if name.is_empty() {
                continue;
            }
            let committed_at = parse_api_time(
                row.get("commit")
                    .and_then(|commit| commit.get("committedDate")),
            )
            .max(parse_api_time(row.get("committedDate")));
            branches.push(BranchRow { name, committed_at });
        }
        if count < PER_PAGE as usize {
            break;
        }
    }
    Ok(branches)
}

#[derive(Debug, Clone)]
struct CommitRow {
    sha: String,
    message: String,
    author: Option<String>,
    committed_at: i64,
    payload: Value,
}

async fn fetch_commits(
    client: &YunxiaoClient,
    org: &str,
    repo_id: i64,
    branch: &str,
    since: i64,
    backfill: bool,
) -> Result<Vec<CommitRow>, String> {
    let path = format!("/oapi/v1/codeup/organizations/{org}/repositories/{repo_id}/commits");
    let max_pages = if backfill {
        (BACKFILL_MAX_PER_BRANCH as i64 / PER_PAGE).max(1)
    } else {
        1
    };
    let mut commits = Vec::new();
    for page in 1..=max_pages {
        let mut query = vec![
            ("refName", branch.to_string()),
            ("page", page.to_string()),
            ("perPage", PER_PAGE.to_string()),
        ];
        if since > 0 {
            query.push(("start", format_api_time(since)));
        }
        let response = client
            .get(&path, &query)
            .await
            .map_err(|e| format!("拉取分支 {branch} 提交失败: {e}"))?;
        let rows = as_array(&response);
        let count = rows.len();
        for row in &rows {
            if let Some(commit) = parse_commit(row) {
                commits.push(commit);
            }
            if commits.len() >= BACKFILL_MAX_PER_BRANCH {
                break;
            }
        }
        if count < PER_PAGE as usize || commits.len() >= BACKFILL_MAX_PER_BRANCH {
            break;
        }
    }
    Ok(commits)
}

fn parse_commit(row: &Value) -> Option<CommitRow> {
    let sha = s2(row, "id", "sha");
    if sha.is_empty() {
        return None;
    }
    let mut message = s2(row, "message", "title");
    if message.is_empty() {
        message = s(row, "comment");
    }
    let mut author = s(row, "authorName");
    if author.is_empty() {
        author = nested_s(row, "author", "name");
    }
    if author.is_empty() {
        author = s(row, "authorEmail");
    }
    let committed_at = parse_api_time(
        row.get("committedDate")
            .or_else(|| row.get("committedAt"))
            .or_else(|| row.get("createdAt")),
    );
    let mut short_sha = s2(row, "shortId", "shortSha");
    if short_sha.is_empty() {
        short_sha = sha.chars().take(8).collect();
    }
    let payload = json!({
        "sha": sha,
        "shortSha": short_sha,
        "message": message,
        "author": author,
        "committedAt": committed_at,
    });
    Some(CommitRow {
        sha,
        message,
        author: if author.is_empty() {
            None
        } else {
            Some(author)
        },
        committed_at,
        payload,
    })
}

async fn fetch_merge_requests(
    client: &YunxiaoClient,
    org: &str,
    repo_id: i64,
) -> Result<Vec<Value>, String> {
    let path = format!("/oapi/v1/codeup/organizations/{org}/changeRequests");
    let mut requests = Vec::new();
    for page in 1..=MAX_PAGES {
        let query = vec![
            ("projectIds", repo_id.to_string()),
            ("page", page.to_string()),
            ("perPage", PER_PAGE.to_string()),
        ];
        let response = client
            .get(&path, &query)
            .await
            .map_err(|e| format!("拉取仓库 {repo_id} 合并请求失败: {e}"))?;
        let rows = as_array(&response);
        let count = rows.len();
        requests.extend(rows);
        if count < PER_PAGE as usize || requests.len() >= 500 {
            break;
        }
    }
    Ok(requests)
}

// ---------------------------------------------------------------------------
// 事件草稿
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
struct DraftEvent {
    id: String,
    repo_id: i64,
    kind: &'static str,
    external_id: String,
    branch: Option<String>,
    target_branch: Option<String>,
    title: String,
    author: Option<String>,
    occurred_at: i64,
    source: &'static str,
    pushed: bool,
    backfilled: bool,
    payload: Value,
    attributions: Vec<refs::Attribution>,
}

#[derive(Debug, Clone)]
struct StoredLink {
    identifier: String,
    workitem_id: Option<String>,
    relation: String,
    confidence: String,
}

fn first_line(message: &str) -> String {
    message
        .lines()
        .next()
        .unwrap_or_default()
        .trim()
        .chars()
        .take(200)
        .collect()
}

fn commit_draft(
    repo_id: i64,
    branch: &BranchRow,
    commit: &CommitRow,
    settings: &Settings,
    backfilled: bool,
) -> DraftEvent {
    DraftEvent {
        id: format!("commit:{repo_id}:{}", commit.sha),
        repo_id,
        kind: "commit",
        external_id: commit.sha.clone(),
        branch: Some(branch.name.clone()),
        target_branch: None,
        title: first_line(&commit.message),
        author: commit.author.clone(),
        occurred_at: commit.committed_at,
        source: "remote",
        pushed: true,
        backfilled,
        payload: commit.payload.clone(),
        attributions: refs::attribute_commit(
            &commit.message,
            Some(&branch.name),
            &settings.link_pattern,
        ),
    }
}

fn mr_draft(
    repo_id: i64,
    request: &Value,
    settings: &Settings,
    backfilled: bool,
) -> Option<DraftEvent> {
    let local_id = i64_value(request, "localId")?;
    if local_id <= 0 {
        return None;
    }
    let source_branch = s2(request, "sourceBranch", "source_branch");
    let target_branch = s2(request, "targetBranch", "target_branch");
    let mut title = s(request, "title");
    if title.is_empty() {
        title = format!("MR !{local_id}");
    }
    let state = s2(request, "state", "newVersionState");
    let mut author = s2(request, "authorName", "author.name");
    if author.is_empty() {
        author = nested_s(request, "author", "name");
    }
    let occurred_at = parse_api_time(
        request
            .get("createdAt")
            .or_else(|| request.get("created_at"))
            .or_else(|| request.get("updatedAt")),
    );
    let web_url = s2(request, "webUrl", "web_url");
    let payload = json!({
        "localId": local_id,
        "state": state,
        "sourceBranch": source_branch,
        "targetBranch": target_branch,
        "author": author,
        "webUrl": web_url,
    });
    Some(DraftEvent {
        id: format!("mr:{repo_id}:{local_id}"),
        repo_id,
        kind: "mr",
        external_id: local_id.to_string(),
        branch: if source_branch.is_empty() {
            None
        } else {
            Some(source_branch.clone())
        },
        target_branch: if target_branch.is_empty() {
            None
        } else {
            Some(target_branch.clone())
        },
        title,
        author: if author.is_empty() {
            None
        } else {
            Some(author)
        },
        occurred_at,
        source: "remote",
        pushed: true,
        backfilled,
        payload,
        attributions: refs::attribute_merge_request(
            &s(request, "title"),
            &source_branch,
            &target_branch,
            &settings.link_pattern,
        ),
    })
}

fn local_commit_draft(
    repo_id: i64,
    binding: &store::LocalBindingRow,
    commit: crate::local_repo::LocalCommit,
    settings: &Settings,
) -> DraftEvent {
    let short_sha: String = commit.sha.chars().take(8).collect();
    let payload = json!({
        "sha": commit.sha,
        "shortSha": short_sha,
        "message": commit.message,
        "author": commit.author,
        "committedAt": commit.committed_at,
        "filesChanged": commit.files_changed,
        "additions": commit.additions,
        "deletions": commit.deletions,
    });
    DraftEvent {
        id: format!("commit:{repo_id}:{}", commit.sha),
        repo_id,
        kind: "commit",
        external_id: commit.sha.clone(),
        branch: binding.default_branch.clone(),
        target_branch: None,
        title: first_line(&commit.message),
        author: commit.author,
        occurred_at: commit.committed_at,
        source: "local",
        pushed: false,
        backfilled: false,
        payload,
        attributions: refs::attribute_commit(
            &commit.message,
            binding.default_branch.as_deref(),
            &settings.link_pattern,
        ),
    }
}

// ---------------------------------------------------------------------------
// 归属 + 编号解析
// ---------------------------------------------------------------------------

fn build_links(
    attributions: &mut Vec<refs::Attribution>,
    resolved: &HashMap<String, ResolvedWorkitemRef>,
) -> Vec<StoredLink> {
    // primary 是 Task/Bug 且父需求可解析 → 追加 rollup（只读缓存，不额外发请求）
    let rollup: Option<(String, String)> = attributions
        .iter()
        .find(|attribution| attribution.is_primary())
        .filter(|attribution| attribution.is_task_or_bug())
        .and_then(|attribution| resolved.get(&attribution.identifier))
        .and_then(|reference| {
            let parent_id = reference.parent_workitem_id.clone()?;
            let parent_identifier = reference
                .parent_identifier
                .clone()
                .unwrap_or_else(|| parent_id.clone());
            Some((parent_identifier, parent_id))
        });
    let mut rollup_ids: HashMap<String, String> = HashMap::new();
    if let Some((parent_identifier, parent_id)) = &rollup {
        refs::push_rollup(attributions, parent_identifier);
        rollup_ids.insert(
            refs::normalize_identifier(parent_identifier)
                .unwrap_or_else(|| parent_identifier.clone()),
            parent_id.clone(),
        );
    }

    attributions
        .iter()
        .map(|attribution| {
            let workitem_id = resolved
                .get(&attribution.identifier)
                .and_then(|reference| reference.workitem_id.clone())
                .or_else(|| rollup_ids.get(&attribution.identifier).cloned());
            StoredLink {
                identifier: attribution.identifier.clone(),
                workitem_id,
                relation: attribution.relation.clone(),
                confidence: attribution.confidence.clone(),
            }
        })
        .collect()
}

/// 批量解析编号（供命令与同步复用）：缓存 1h 优先，未命中按 Req/Bug/Task 搜索。
pub async fn resolve_workitem_identifiers(
    state: &AppState,
    identifiers: &[String],
) -> Result<Vec<ResolvedWorkitemRef>, String> {
    if identifiers.is_empty() {
        return Ok(Vec::new());
    }
    let (client, settings) = snapshot(state)?;
    if settings.organization_id.trim().is_empty() {
        return Err("NOT_CONFIGURED: 请先在设置中填写组织 ID".into());
    }

    let mut order: Vec<String> = Vec::new();
    let mut invalid: Vec<ResolvedWorkitemRef> = Vec::new();
    for raw in identifiers {
        match refs::normalize_identifier(raw) {
            Some(identifier) => {
                if !order.contains(&identifier) {
                    order.push(identifier);
                }
            }
            None => {
                let identifier = raw.trim().to_string();
                if !invalid.iter().any(|item| item.identifier == identifier) {
                    invalid.push(ResolvedWorkitemRef {
                        identifier: identifier.clone(),
                        workitem_id: None,
                        category: None,
                        subject: None,
                        parent_workitem_id: None,
                        parent_identifier: None,
                        error: Some(format!("标识符格式无效: {identifier}")),
                    });
                }
            }
        }
    }

    let now = store::now_ms();
    let mut resolved: HashMap<String, ResolvedWorkitemRef> = HashMap::new();
    for chunk in order.chunks(MAX_RESOLVE_BATCH) {
        let cached = {
            let conn = state.db.lock().unwrap();
            store::cached_identifiers(&conn, chunk, now)?
        };
        resolved.extend(cached);
        let missing: Vec<String> = chunk
            .iter()
            .filter(|identifier| !resolved.contains_key(*identifier))
            .cloned()
            .collect();
        if missing.is_empty() {
            continue;
        }
        let mut fresh: Vec<ResolvedWorkitemRef> = Vec::with_capacity(missing.len());
        for identifier in &missing {
            fresh.push(resolve_one(&client, &settings, identifier).await?);
        }
        {
            let conn = state.db.lock().unwrap();
            for reference in &mut fresh {
                if reference.parent_identifier.is_none() {
                    if let Some(parent_id) = reference.parent_workitem_id.clone() {
                        reference.parent_identifier =
                            store::identifier_for_workitem(&conn, &parent_id)?;
                    }
                }
            }
            store::put_identifier_cache(&conn, &fresh, now)?;
        }
        for reference in fresh {
            resolved.insert(reference.identifier.clone(), reference);
        }
    }

    let mut output: Vec<ResolvedWorkitemRef> = order
        .into_iter()
        .filter_map(|identifier| resolved.remove(&identifier))
        .collect();
    output.extend(invalid);
    Ok(output)
}

async fn resolve_one(
    client: &YunxiaoClient,
    settings: &Settings,
    identifier: &str,
) -> Result<ResolvedWorkitemRef, String> {
    let org = settings.organization_id.trim();
    let space = settings.default_space_identifier.trim();
    let category_hint = refs::category_of(identifier).map(str::to_string);
    if space.is_empty() {
        return Ok(ResolvedWorkitemRef {
            identifier: identifier.to_string(),
            workitem_id: None,
            category: category_hint,
            subject: None,
            parent_workitem_id: None,
            parent_identifier: None,
            error: Some("NOT_CONFIGURED: 请先在设置中选择默认项目空间".into()),
        });
    }
    let mut categories: Vec<&str> = Vec::new();
    if let Some(hint) = refs::category_of(identifier) {
        categories.push(hint);
    }
    for category in ["Req", "Bug", "Task"] {
        if !categories.contains(&category) {
            categories.push(category);
        }
    }
    for category in categories {
        let body = json!({
            "category": category,
            "spaceId": space,
            "spaceType": "Project",
            "page": 1,
            "perPage": 20,
            "keyword": identifier,
        });
        let response = client
            .post(
                &format!("/oapi/v1/projex/organizations/{org}/workitems:search"),
                &[],
                body,
            )
            .await
            .map_err(|e| format!("解析编号 {identifier} 失败: {e}"))?;
        let rows = as_array(&response);
        for row in &rows {
            let raw = {
                let value = s(row, "identifier");
                if value.is_empty() {
                    s(row, "serialNumber")
                } else {
                    value
                }
            };
            if refs::normalize_identifier(&raw).as_deref() != Some(identifier) {
                continue;
            }
            let workitem_id = s2(row, "id", "workitemId");
            if workitem_id.is_empty() {
                continue;
            }
            let mut parent_id = s2(row, "parentId", "parent.id");
            if parent_id.is_empty() {
                parent_id = nested_s(row, "parent", "id");
            }
            let mut parent_identifier = s2(row, "parentIdentifier", "parent.identifier");
            if parent_identifier.is_empty() {
                parent_identifier = nested_s(row, "parent", "serialNumber");
            }
            let category = {
                let raw = s2(row, "categoryId", "category");
                normalize_category(&raw)
                    .map(str::to_string)
                    .or_else(|| refs::category_of(identifier).map(str::to_string))
                    .or_else(|| {
                        if raw.trim().is_empty() {
                            Some(category.to_string())
                        } else {
                            None
                        }
                    })
            };
            let subject = {
                let value = s(row, "subject");
                if value.is_empty() {
                    None
                } else {
                    Some(value)
                }
            };
            return Ok(ResolvedWorkitemRef {
                identifier: identifier.to_string(),
                workitem_id: Some(workitem_id),
                category,
                subject,
                parent_workitem_id: if parent_id.is_empty() {
                    None
                } else {
                    Some(parent_id)
                },
                parent_identifier: refs::normalize_identifier(&parent_identifier),
                error: None,
            });
        }
    }
    Ok(ResolvedWorkitemRef {
        identifier: identifier.to_string(),
        workitem_id: None,
        category: category_hint,
        subject: None,
        parent_workitem_id: None,
        parent_identifier: None,
        error: Some(format!("未找到编号 {identifier} 对应的工作项")),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn settings_with(lik_pattern: &str) -> Settings {
        Settings {
            link_pattern: lik_pattern.to_string(),
            ..Settings::default()
        }
    }

    #[test]
    fn target_repos_union_covers_watched_workitem_and_local_bindings() {
        let watched = vec![1, 2, 0, 3];
        let mut workitem_repos: HashMap<String, Vec<i64>> = HashMap::new();
        workitem_repos.insert("REQ-1".into(), vec![2, 4]);
        workitem_repos.insert("REQ-2".into(), vec![5, -1]);
        let local = vec![6, 1];

        assert_eq!(
            union_target_repo_ids(&watched, &workitem_repos, &local, None),
            vec![1, 2, 3, 4, 5, 6]
        );
        assert_eq!(
            union_target_repo_ids(&watched, &workitem_repos, &local, Some(&[2, 5, 99])),
            vec![2, 5]
        );
        assert!(union_target_repo_ids(&[], &HashMap::new(), &[], Some(&[1])).is_empty());
    }

    #[test]
    fn api_time_parser_handles_iso_naive_and_epoch_units() {
        assert_eq!(
            parse_api_time(Some(&json!("2026-10-09T03:00:00Z"))),
            1_791_514_800_000
        );
        assert_eq!(
            parse_api_time(Some(&json!("2026-10-09T11:00:00+08:00"))),
            1_791_514_800_000
        );
        assert_eq!(
            parse_api_time(Some(&json!("2026-10-09 03:00:00"))),
            1_791_514_800_000
        );
        assert_eq!(
            parse_api_time(Some(&json!("2026-10-09"))),
            1_791_504_000_000
        );
        assert_eq!(
            parse_api_time(Some(&json!(1_791_514_800_i64))),
            1_791_514_800_000
        );
        assert_eq!(
            parse_api_time(Some(&json!(1_791_514_800_000_i64))),
            1_791_514_800_000
        );
        assert_eq!(parse_api_time(None), 0);
        assert_eq!(parse_api_time(Some(&json!(""))), 0);
    }

    #[test]
    fn event_ids_follow_contract() {
        let settings = settings_with(r"([A-Za-z][A-Za-z0-9]{1,15}[-_]\d{1,})");
        let branch = BranchRow {
            name: "feature/task-7".into(),
            committed_at: 100,
        };
        let commit = CommitRow {
            sha: "abc123".into(),
            message: "fix\n\nRefs: TASK-7".into(),
            author: Some("dev".into()),
            committed_at: 100,
            payload: json!({ "sha": "abc123" }),
        };
        let draft = commit_draft(42, &branch, &commit, &settings, true);
        assert_eq!(draft.id, "commit:42:abc123");
        assert_eq!(draft.external_id, "abc123");
        assert!(draft.backfilled);
        assert_eq!(draft.attributions[0].identifier, "TASK-7");
        assert_eq!(draft.attributions[0].relation, "primary");

        let request = json!({
            "localId": 9,
            "title": "合并 feature/task-7",
            "sourceBranch": "feature/task-7",
            "targetBranch": "release/req-1",
            "state": "opened",
            "createdAt": "2026-10-09T03:00:00Z"
        });
        let draft = mr_draft(42, &request, &settings, false).expect("MR 应生成事件");
        assert_eq!(draft.id, "mr:42:9");
        assert_eq!(draft.kind, "mr");
        assert_eq!(draft.occurred_at, 1_791_514_800_000);
        assert!(draft
            .attributions
            .iter()
            .any(|link| link.identifier == "TASK-7" && link.relation == "primary"));
        assert!(draft
            .attributions
            .iter()
            .any(|link| link.identifier == "REQ-1" && link.confidence == "target"));
    }

    #[test]
    fn build_links_adds_rollup_parent_for_task_primary() {
        let mut attributions = refs::attribute_commit(
            "Refs: TASK-7",
            Some("feature/task-7"),
            r"([A-Za-z][A-Za-z0-9]{1,15}[-_]\d{1,})",
        );
        let mut resolved: HashMap<String, ResolvedWorkitemRef> = HashMap::new();
        resolved.insert(
            "TASK-7".into(),
            ResolvedWorkitemRef {
                identifier: "TASK-7".into(),
                workitem_id: Some("wi-task".into()),
                category: Some("Task".into()),
                subject: None,
                parent_workitem_id: Some("wi-req".into()),
                parent_identifier: Some("REQ-9".into()),
                error: None,
            },
        );
        let links = build_links(&mut attributions, &resolved);
        let primary = links
            .iter()
            .find(|link| link.relation == "primary")
            .expect("应有 primary");
        assert_eq!(primary.workitem_id.as_deref(), Some("wi-task"));
        let rollup = links
            .iter()
            .find(|link| link.relation == "rollup")
            .expect("Task primary 应带出父需求 rollup");
        assert_eq!(rollup.identifier, "REQ-9");
        assert_eq!(rollup.workitem_id.as_deref(), Some("wi-req"));
        assert_eq!(rollup.confidence, "inherited");
    }

    #[test]
    fn unresolved_identifier_still_writes_link_without_workitem_id() {
        let mut attributions = refs::attribute_commit(
            "Refs: REQ-404",
            None,
            r"([A-Za-z][A-Za-z0-9]{1,15}[-_]\d{1,})",
        );
        let links = build_links(&mut attributions, &HashMap::new());
        assert_eq!(links.len(), 1);
        assert_eq!(links[0].identifier, "REQ-404");
        assert_eq!(links[0].relation, "primary");
        assert!(links[0].workitem_id.is_none());
    }

    #[test]
    fn category_values_are_normalized_to_contract_values() {
        assert_eq!(normalize_category("req"), Some("Req"));
        assert_eq!(normalize_category("Requirement"), Some("Req"));
        assert_eq!(normalize_category("BUG"), Some("Bug"));
        assert_eq!(normalize_category(" Task "), Some("Task"));
        assert_eq!(normalize_category("Story"), None);
        assert_eq!(normalize_category(""), None);
    }

    #[test]
    #[allow(clippy::assertions_on_constants)]
    fn first_sync_window_and_page_budget_are_bounded() {
        assert_eq!(BACKFILL_DAYS, 30);
        assert_eq!(BACKFILL_MAX_PER_BRANCH, 500);
        assert_eq!((BACKFILL_MAX_PER_BRANCH as i64 / PER_PAGE).max(1), 5);
        assert!(MAX_BRANCHES_PER_REPO <= 20);
        assert!(MAX_RESOLVE_BATCH <= 50);
    }
}
