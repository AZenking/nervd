//! SQLite 事件索引、归属、游标与回写记账。
//!
//! 所有函数都接收 `&Connection`（不碰 `AppState`），由调用方保证短锁、不跨 await；
//! SQL 一律参数绑定，禁止字符串拼接用户输入。表结构见 `db.rs` 的 `init_conn`。

use crate::attribution::model::{
    ActivityCandidate, ActivityPolicy, AttributionRepoStatus, AttributionStatus, ChangeEvent,
    ChangePage, ResolvedWorkitemRef, ViewerIdentity, WorkitemChange, WorkitemPerson,
};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;
use std::collections::HashMap;

/// 编号解析缓存 TTL：1 小时
pub const IDENTIFIER_TTL_MS: i64 = 3_600_000;
/// 列表默认 / 最大分页
pub const DEFAULT_PAGE_LIMIT: i64 = 50;
pub const MAX_PAGE_LIMIT: i64 = 200;
/// `attribution_policy.enabled` 没有独立列（db.rs 冻结），借 app_settings 存布尔值
pub const POLICY_ENABLED_KEY: &str = "attributionPolicyEnabled";
/// 回写失败退避：1m / 5m / 15m，最多 3 次
const RETRY_BACKOFF_MS: [i64; 3] = [60_000, 300_000, 900_000];
const MAX_ATTEMPTS: i64 = 3;

pub const ACTIVITY_STATUSES: [&str; 4] = ["pending", "posted", "failed", "skipped"];
pub const RELATIONS: [&str; 3] = ["primary", "related", "rollup"];
pub const CONFIDENCES: [&str; 5] = ["explicit", "branch", "target", "inherited", "manual"];

const EVENT_COLUMNS: &str = "e.id, e.repo_id, e.kind, e.external_id, e.branch, e.target_branch, \
     e.title, e.author, e.occurred_at, e.source, e.pushed, e.backfilled, e.payload_json";

/// 当前时间（epoch 毫秒）。变更归属全链路统一用毫秒，与 `local_repo::now_ms`
/// 及前端 `committedAt` / `updatedAt` 的语义保持一致。
pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn clamp_limit(limit: Option<i64>) -> i64 {
    limit.unwrap_or(DEFAULT_PAGE_LIMIT).clamp(1, MAX_PAGE_LIMIT)
}

// ---------------------------------------------------------------------------
// 事件 upsert / 归属替换
// ---------------------------------------------------------------------------

/// upsert `code_events` 的输入（借用，避免同步流程里反复 clone）。
pub struct EventInput<'a> {
    pub id: &'a str,
    pub repo_id: i64,
    pub kind: &'a str,
    pub external_id: &'a str,
    pub branch: Option<&'a str>,
    pub target_branch: Option<&'a str>,
    pub title: &'a str,
    pub author: Option<&'a str>,
    pub occurred_at: i64,
    pub source: &'a str,
    pub pushed: bool,
    pub backfilled: bool,
    pub payload: &'a Value,
}

/// upsert 事件：唯一键 `(repo_id, kind, external_id)`。
///
/// 重复时只更新 payload/title/branch/pushed/backfilled，不产生重复行；
/// `pushed` 取 `MAX`，保证「本地先入索引、远端后到」时能翻成已推送而不会反向覆盖。
pub fn upsert_event(conn: &Connection, event: &EventInput<'_>) -> Result<(), String> {
    if event.id.trim().is_empty() {
        return Err("变更事件 ID 不能为空".into());
    }
    if event.external_id.trim().is_empty() {
        return Err("变更事件外部 ID 不能为空".into());
    }
    if !["commit", "mr", "build"].contains(&event.kind) {
        return Err(format!("变更事件类型无效: {}", event.kind));
    }
    if !["remote", "local", "ci"].contains(&event.source) {
        return Err(format!("变更事件来源无效: {}", event.source));
    }
    let payload_text = serde_json::to_string(event.payload)
        .map_err(|e| format!("序列化事件 payload 失败 ({}): {e}", event.id))?;
    conn.execute(
        "INSERT INTO code_events
            (id, repo_id, kind, external_id, branch, target_branch, title, author,
             occurred_at, payload_json, source, pushed, backfilled, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
         ON CONFLICT(repo_id, kind, external_id) DO UPDATE SET
            -- 本地事件先入库、远端同 SHA 后到时保留远端更完整的 payload；
            -- 事件缺时间（MR 无 createdAt）时不得把已有 occurred_at 覆盖成 0
            payload_json = CASE
                WHEN excluded.pushed = 1 OR code_events.pushed = 0 THEN excluded.payload_json
                ELSE code_events.payload_json
            END,
            title = CASE
                WHEN excluded.title <> '' THEN excluded.title
                ELSE code_events.title
            END,
            branch = COALESCE(excluded.branch, code_events.branch),
            target_branch = COALESCE(excluded.target_branch, code_events.target_branch),
            author = COALESCE(excluded.author, code_events.author),
            occurred_at = CASE
                WHEN excluded.occurred_at > 0 THEN excluded.occurred_at
                ELSE code_events.occurred_at
            END,
            pushed = MAX(code_events.pushed, excluded.pushed),
            backfilled = MAX(code_events.backfilled, excluded.backfilled),
            source = CASE
                WHEN code_events.pushed = 1 AND excluded.pushed = 0 THEN code_events.source
                ELSE excluded.source
            END",
        params![
            event.id.trim(),
            event.repo_id,
            event.kind,
            event.external_id,
            event.branch,
            event.target_branch,
            event.title,
            event.author,
            event.occurred_at,
            payload_text,
            event.source,
            event.pushed as i64,
            event.backfilled as i64,
            now_ms()
        ],
    )
    .map(|_| ())
    .map_err(|e| format!("写入变更事件 {} 失败: {e}", event.id))
}

/// `event_workitems` 的一行归属输入。
pub struct WorkitemLinkInput<'a> {
    pub identifier: &'a str,
    pub workitem_id: Option<&'a str>,
    pub relation: &'a str,
    pub confidence: &'a str,
}

/// 替换某事件的全部归属（同一 event 先删后插，事件本身必须已存在）。
pub fn replace_event_workitems(
    conn: &Connection,
    event_id: &str,
    links: &[WorkitemLinkInput<'_>],
) -> Result<(), String> {
    let event_id = event_id.trim();
    if event_id.is_empty() {
        return Err("变更事件 ID 不能为空".into());
    }
    for link in links {
        if !RELATIONS.contains(&link.relation) {
            return Err(format!("归属关系无效: {}", link.relation));
        }
        if !CONFIDENCES.contains(&link.confidence) {
            return Err(format!("归属置信度无效: {}", link.confidence));
        }
        if link.identifier.trim().is_empty() {
            return Err("归属标识符不能为空".into());
        }
    }
    // 同步流程在仓库级事务里调用本函数；已有外层事务时不能再 BEGIN（会报嵌套事务）
    let transaction = if conn.is_autocommit() {
        Some(
            conn.unchecked_transaction()
                .map_err(|e| format!("开启归属写入事务失败: {e}"))?,
        )
    } else {
        None
    };
    let target: &Connection = match &transaction {
        Some(transaction) => transaction,
        None => conn,
    };
    target
        .execute(
            "DELETE FROM event_workitems WHERE event_id = ?1",
            params![event_id],
        )
        .map_err(|e| format!("清理事件 {event_id} 的旧归属失败: {e}"))?;
    for link in links {
        target
            .execute(
                "INSERT INTO event_workitems(event_id, workitem_id, identifier, relation, confidence)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    event_id,
                    link.workitem_id,
                    link.identifier.trim(),
                    link.relation,
                    link.confidence
                ],
            )
            .map_err(|e| format!("写入事件 {event_id} 归属失败: {e}"))?;
    }
    match transaction {
        Some(transaction) => transaction
            .commit()
            .map_err(|e| format!("提交事件 {event_id} 归属失败: {e}")),
        None => Ok(()),
    }
}

/// 该事件是否已有手动归属（同步时不得覆盖人工指派）。
pub fn has_manual_attribution(conn: &Connection, event_id: &str) -> Result<bool, String> {
    conn.query_row(
        "SELECT 1 FROM event_workitems WHERE event_id = ?1 AND confidence = 'manual' LIMIT 1",
        params![event_id],
        |_| Ok(()),
    )
    .optional()
    .map(|found| found.is_some())
    .map_err(|e| format!("查询事件 {event_id} 手动归属失败: {e}"))
}

/// 把事件归属手动指派为某工作项；`relation = primary` 时先删掉同事件其它 primary。
pub fn assign_change_workitem(
    conn: &Connection,
    event_id: &str,
    workitem_id: &str,
    relation: Option<&str>,
) -> Result<bool, String> {
    let event_id = event_id.trim();
    let workitem_id = workitem_id.trim();
    if event_id.is_empty() {
        return Err("变更事件 ID 不能为空".into());
    }
    if workitem_id.is_empty() {
        return Err("工作项 ID 不能为空".into());
    }
    let relation = relation
        .map(str::trim)
        .filter(|r| !r.is_empty())
        .unwrap_or("primary");
    if !RELATIONS.contains(&relation) {
        return Err(format!(
            "归属关系无效: {relation}（允许 primary/related/rollup）"
        ));
    }
    let exists = conn
        .query_row(
            "SELECT 1 FROM code_events WHERE id = ?1",
            params![event_id],
            |_| Ok(()),
        )
        .optional()
        .map_err(|e| format!("查询变更事件 {event_id} 失败: {e}"))?;
    if exists.is_none() {
        return Err(format!("变更事件不存在: {event_id}"));
    }
    // 优先用编号缓存反查；缓存没有时沿用事件既有的 primary 标识符
    // （待归属事件本来就没有 workitemId，人工指派不应把 REQ-2 变成裸 workitemId）
    let identifier = match identifier_for_workitem(conn, workitem_id)? {
        Some(identifier) => identifier,
        None => conn
            .query_row(
                "SELECT identifier FROM event_workitems
                 WHERE event_id = ?1 AND relation = 'primary'
                 ORDER BY identifier LIMIT 1",
                params![event_id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|e| format!("读取事件 {event_id} 现有标识符失败: {e}"))?
            .unwrap_or_else(|| workitem_id.to_string()),
    };
    let transaction = if conn.is_autocommit() {
        Some(
            conn.unchecked_transaction()
                .map_err(|e| format!("开启手动指派事务失败: {e}"))?,
        )
    } else {
        None
    };
    let target: &Connection = match &transaction {
        Some(transaction) => transaction,
        None => conn,
    };
    if relation == "primary" {
        target
            .execute(
                "DELETE FROM event_workitems WHERE event_id = ?1 AND relation = 'primary'",
                params![event_id],
            )
            .map_err(|e| format!("清理事件 {event_id} 的旧 primary 失败: {e}"))?;
    }
    target
        .execute(
            "INSERT INTO event_workitems(event_id, workitem_id, identifier, relation, confidence)
             VALUES (?1, ?2, ?3, ?4, 'manual')
             ON CONFLICT(event_id, identifier, relation) DO UPDATE SET
                workitem_id = excluded.workitem_id,
                confidence = 'manual'",
            params![event_id, workitem_id, identifier, relation],
        )
        .map_err(|e| format!("手动指派事件 {event_id} 失败: {e}"))?;
    if let Some(transaction) = transaction {
        transaction
            .commit()
            .map_err(|e| format!("提交手动指派失败: {e}"))?;
    }
    Ok(true)
}

/// 通过编号缓存反查工作项编号（手动指派只拿到 workitemId 时用）。
pub fn identifier_for_workitem(
    conn: &Connection,
    workitem_id: &str,
) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT identifier FROM workitem_identifiers
         WHERE workitem_id = ?1
         ORDER BY COALESCE(resolved_at, 0) DESC LIMIT 1",
        params![workitem_id],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .map_err(|e| format!("按工作项 ID {workitem_id} 反查编号失败: {e}"))
}

// ---------------------------------------------------------------------------
// 查询：工作项时间线 / 待归属
// ---------------------------------------------------------------------------

fn event_from_row(row: &rusqlite::Row<'_>, offset: usize) -> rusqlite::Result<ChangeEvent> {
    let payload_text: String = row.get(offset + 12)?;
    Ok(ChangeEvent {
        id: row.get(offset)?,
        repo_id: row.get(offset + 1)?,
        repo_name: None,
        kind: row.get(offset + 2)?,
        external_id: row.get(offset + 3)?,
        branch: row.get(offset + 4)?,
        target_branch: row.get(offset + 5)?,
        title: row.get(offset + 6)?,
        author: row.get(offset + 7)?,
        occurred_at: row.get(offset + 8)?,
        source: row.get(offset + 9)?,
        pushed: row.get::<_, i64>(offset + 10)? != 0,
        backfilled: row.get::<_, i64>(offset + 11)? != 0,
        payload: serde_json::from_str(&payload_text).unwrap_or(Value::Null),
    })
}

/// 工作项时间线：`occurred_at DESC`，默认排除 rollup，带 activity_posts.status。
pub fn list_workitem_changes(
    conn: &Connection,
    workitem_id: &str,
    limit: Option<i64>,
    before: Option<i64>,
    include_rollup: bool,
) -> Result<ChangePage, String> {
    let workitem_id = workitem_id.trim();
    if workitem_id.is_empty() {
        return Err("工作项 ID 不能为空".into());
    }
    let limit = clamp_limit(limit);
    let sql = format!(
        "SELECT {EVENT_COLUMNS}, w.relation, w.confidence, w.identifier, w.workitem_id, ap.status
         FROM event_workitems w
         JOIN code_events e ON e.id = w.event_id
         LEFT JOIN activity_posts ap
                ON ap.event_id = e.id AND ap.workitem_id = w.workitem_id
         WHERE w.workitem_id = ?1
           AND (?2 = 1 OR w.relation <> 'rollup')
           AND (?3 IS NULL OR e.occurred_at < ?3)
         ORDER BY e.occurred_at DESC, e.id DESC
         LIMIT ?4"
    );
    let mut statement = conn
        .prepare(&sql)
        .map_err(|e| format!("查询工作项时间线失败: {e}"))?;
    let rows = statement
        .query_map(
            params![workitem_id, include_rollup as i64, before, limit],
            |row| {
                Ok(WorkitemChange {
                    event: event_from_row(row, 0)?,
                    relation: row.get(13)?,
                    confidence: row.get(14)?,
                    identifier: row.get(15)?,
                    workitem_id: row.get(16)?,
                    activity_status: row.get(17)?,
                })
            },
        )
        .map_err(|e| format!("查询工作项时间线失败: {e}"))?;
    let items = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("读取工作项时间线失败: {e}"))?;
    let next_before = if items.len() as i64 == limit {
        items.last().map(|item| item.event.occurred_at)
    } else {
        None
    };
    Ok(ChangePage { items, next_before })
}

/// 待归属队列：没有任何「已解析 primary」的事件（含 primary workitemId 为 NULL）。
pub fn list_unattributed_changes(
    conn: &Connection,
    repo_id: Option<i64>,
    limit: Option<i64>,
) -> Result<ChangePage, String> {
    if matches!(repo_id, Some(id) if id <= 0) {
        return Err("仓库 ID 无效".into());
    }
    let limit = clamp_limit(limit);
    let sql = format!(
        "SELECT {EVENT_COLUMNS},
                COALESCE(w.relation, 'primary'),
                COALESCE(w.confidence, 'branch'),
                COALESCE(w.identifier, ''),
                w.workitem_id,
                ap.status
         FROM code_events e
         LEFT JOIN event_workitems w ON w.rowid = (
             SELECT x.rowid FROM event_workitems x WHERE x.event_id = e.id
             ORDER BY CASE x.relation
                          WHEN 'primary' THEN 0
                          WHEN 'rollup' THEN 1
                          ELSE 2
                      END,
                      x.identifier
             LIMIT 1
         )
         LEFT JOIN activity_posts ap
                ON ap.event_id = e.id AND ap.workitem_id = w.workitem_id
         WHERE NOT EXISTS (
             SELECT 1 FROM event_workitems p
             WHERE p.event_id = e.id AND p.relation = 'primary' AND p.workitem_id IS NOT NULL
         )
           AND (?1 IS NULL OR e.repo_id = ?1)
         ORDER BY e.occurred_at DESC, e.id DESC
         LIMIT ?2"
    );
    let mut statement = conn
        .prepare(&sql)
        .map_err(|e| format!("查询待归属变更失败: {e}"))?;
    let rows = statement
        .query_map(params![repo_id, limit], |row| {
            Ok(WorkitemChange {
                event: event_from_row(row, 0)?,
                relation: row.get(13)?,
                confidence: row.get(14)?,
                identifier: row.get(15)?,
                workitem_id: row.get(16)?,
                activity_status: row.get(17)?,
            })
        })
        .map_err(|e| format!("查询待归属变更失败: {e}"))?;
    let items = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("读取待归属变更失败: {e}"))?;
    let next_before = if items.len() as i64 == limit {
        items.last().map(|item| item.event.occurred_at)
    } else {
        None
    };
    Ok(ChangePage { items, next_before })
}

// ---------------------------------------------------------------------------
// 同步游标
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default)]
pub struct RepoSyncState {
    pub cursor: Option<String>,
    pub backfilled_at: Option<i64>,
}

pub fn get_sync_state(
    conn: &Connection,
    repo_id: i64,
    ref_name: &str,
) -> Result<Option<RepoSyncState>, String> {
    conn.query_row(
        "SELECT cursor, backfilled_at
         FROM repo_sync_state WHERE repo_id = ?1 AND ref = ?2",
        params![repo_id, ref_name],
        |row| {
            Ok(RepoSyncState {
                cursor: row.get(0)?,
                backfilled_at: row.get(1)?,
            })
        },
    )
    .optional()
    .map_err(|e| format!("读取仓库 {repo_id}/{ref_name} 同步游标失败: {e}"))
}

/// 写游标：`None` 的列保持库中原值（`cursor` / `backfilled_at`），`last_error` 显式覆盖。
pub fn save_sync_state(
    conn: &Connection,
    repo_id: i64,
    ref_name: &str,
    cursor: Option<&str>,
    backfilled_at: Option<i64>,
    last_sync_at: i64,
    last_error: Option<&str>,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO repo_sync_state(repo_id, ref, cursor, backfilled_at, last_sync_at, last_error)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(repo_id, ref) DO UPDATE SET
            cursor = COALESCE(excluded.cursor, repo_sync_state.cursor),
            backfilled_at = COALESCE(excluded.backfilled_at, repo_sync_state.backfilled_at),
            last_sync_at = excluded.last_sync_at,
            last_error = excluded.last_error",
        params![
            repo_id,
            ref_name,
            cursor,
            backfilled_at,
            last_sync_at,
            last_error
        ],
    )
    .map(|_| ())
    .map_err(|e| format!("写入仓库 {repo_id}/{ref_name} 同步游标失败: {e}"))
}

/// 同步状态（供 `get_attribution_status`）。`cursor` 取 repo 级 `*` 行的最新分支游标。
pub fn attribution_status(conn: &Connection, syncing: bool) -> Result<AttributionStatus, String> {
    let mut statement = conn
        .prepare(
            "SELECT repo_id,
                    MAX(last_sync_at),
                    MAX(CASE WHEN ref = '*' THEN last_error END),
                    MAX(CASE WHEN ref = '*' THEN cursor END)
             FROM repo_sync_state
             GROUP BY repo_id
             ORDER BY repo_id",
        )
        .map_err(|e| format!("查询同步状态失败: {e}"))?;
    let rows = statement
        .query_map([], |row| {
            Ok(AttributionRepoStatus {
                repo_id: row.get(0)?,
                last_sync_at: row.get(1)?,
                last_error: row.get(2)?,
                cursor: row.get(3)?,
            })
        })
        .map_err(|e| format!("查询同步状态失败: {e}"))?;
    let repos = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("读取同步状态失败: {e}"))?;
    let last_sync_at = repos.iter().filter_map(|repo| repo.last_sync_at).max();
    Ok(AttributionStatus {
        last_sync_at,
        syncing,
        repos,
    })
}

// ---------------------------------------------------------------------------
// 本地仓库绑定（只读：写入由本地仓库子代理负责）
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct LocalBindingRow {
    pub path: String,
    pub default_branch: Option<String>,
}

pub fn get_local_binding(
    conn: &Connection,
    repo_id: i64,
) -> Result<Option<LocalBindingRow>, String> {
    conn.query_row(
        "SELECT path, default_branch FROM repo_local_bindings WHERE repo_id = ?1",
        params![repo_id],
        |row| {
            Ok(LocalBindingRow {
                path: row.get(0)?,
                default_branch: row.get(1)?,
            })
        },
    )
    .optional()
    .map_err(|e| format!("读取仓库 {repo_id} 本地绑定失败: {e}"))
}

pub fn local_binding_repo_ids(conn: &Connection) -> Result<Vec<i64>, String> {
    let mut statement = conn
        .prepare("SELECT repo_id FROM repo_local_bindings ORDER BY repo_id")
        .map_err(|e| format!("读取本地仓库绑定列表失败: {e}"))?;
    let rows = statement
        .query_map([], |row| row.get::<_, i64>(0))
        .map_err(|e| format!("读取本地仓库绑定列表失败: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("读取本地仓库绑定列表失败: {e}"))
}

// ---------------------------------------------------------------------------
// activity_posts：回写记账与候选
// ---------------------------------------------------------------------------

/// 回写记账 upsert（`status` 必须是 ACTIVITY_STATUSES 之一）。
#[allow(clippy::too_many_arguments)]
pub fn upsert_activity_post(
    conn: &Connection,
    event_id: &str,
    workitem_id: &str,
    batch_key: Option<&str>,
    comment_id: Option<&str>,
    status: &str,
    attempts: i64,
    next_retry_at: Option<i64>,
    error: Option<&str>,
    posted_at: Option<i64>,
) -> Result<(), String> {
    if event_id.trim().is_empty() || workitem_id.trim().is_empty() {
        return Err("事件 ID 与工作项 ID 不能为空".into());
    }
    if !ACTIVITY_STATUSES.contains(&status) {
        return Err(format!("回写状态无效: {status}"));
    }
    conn.execute(
        "INSERT INTO activity_posts
            (event_id, workitem_id, batch_key, comment_id, status, attempts,
             next_retry_at, error, posted_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT(event_id, workitem_id) DO UPDATE SET
            batch_key = COALESCE(excluded.batch_key, activity_posts.batch_key),
            comment_id = COALESCE(excluded.comment_id, activity_posts.comment_id),
            status = excluded.status,
            attempts = excluded.attempts,
            next_retry_at = excluded.next_retry_at,
            error = excluded.error,
            posted_at = COALESCE(excluded.posted_at, activity_posts.posted_at)",
        params![
            event_id.trim(),
            workitem_id.trim(),
            batch_key,
            comment_id,
            status,
            attempts,
            next_retry_at,
            error,
            posted_at
        ],
    )
    .map(|_| ())
    .map_err(|e| format!("写入回写记账失败 ({event_id} → {workitem_id}): {e}"))
}

/// 前端回写结果记账：posted / failed / pending / skipped。
///
/// failed 走 1m/5m/15m 退避，最多 3 次；posted 清空重试时间并记录 posted_at。
pub fn mark_activity(
    conn: &Connection,
    event_id: &str,
    workitem_id: &str,
    status: &str,
    comment_id: Option<&str>,
    error: Option<&str>,
) -> Result<bool, String> {
    let event_id = event_id.trim();
    let workitem_id = workitem_id.trim();
    if event_id.is_empty() || workitem_id.is_empty() {
        return Err("事件 ID 与工作项 ID 不能为空".into());
    }
    if !ACTIVITY_STATUSES.contains(&status) {
        return Err(format!(
            "回写状态无效: {status}（允许 pending/posted/failed/skipped）"
        ));
    }
    let existing_attempts: i64 = conn
        .query_row(
            "SELECT attempts FROM activity_posts WHERE event_id = ?1 AND workitem_id = ?2",
            params![event_id, workitem_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| format!("读取回写记账失败: {e}"))?
        .unwrap_or(0);
    let now = now_ms();
    let (attempts, next_retry_at, posted_at) = match status {
        "posted" => (existing_attempts, None, Some(now)),
        "failed" => {
            let attempts = (existing_attempts + 1).min(MAX_ATTEMPTS);
            let next_retry_at = if attempts < MAX_ATTEMPTS {
                Some(now + RETRY_BACKOFF_MS[(attempts - 1).max(0) as usize])
            } else {
                None
            };
            (attempts, next_retry_at, None)
        }
        _ => (existing_attempts, None, None),
    };
    upsert_activity_post(
        conn,
        event_id,
        workitem_id,
        None,
        comment_id,
        status,
        attempts,
        next_retry_at,
        if status == "posted" { None } else { error },
        posted_at,
    )?;
    Ok(true)
}

/// 首次回填的事件不补历史动态：给所有已解析工作项打 `skipped` 记账（不覆盖已有行）。
pub fn mark_event_activity_skipped(conn: &Connection, event_id: &str) -> Result<(), String> {
    conn.execute(
        "INSERT OR IGNORE INTO activity_posts(event_id, workitem_id, status, attempts)
         SELECT event_id, workitem_id, 'skipped', 0
         FROM event_workitems
         WHERE event_id = ?1 AND workitem_id IS NOT NULL AND relation <> 'rollup'",
        params![event_id.trim()],
    )
    .map(|_| ())
    .map_err(|e| format!("标记事件 {event_id} 回写为 skipped 失败: {e}"))
}

/// 待回写候选：无记账，或 failed/pending 且已到重试时间（且未超过 3 次）。
pub fn list_activity_candidates(
    conn: &Connection,
    limit: Option<i64>,
    now: i64,
    viewer: Option<&ViewerIdentity>,
) -> Result<Vec<ActivityCandidate>, String> {
    // fail-closed：没有「我」的身份就不回写任何工作项，避免默认写到全组织。
    let Some(viewer) = viewer.filter(|viewer| viewer.is_effective()) else {
        return Ok(Vec::new());
    };
    let viewer_id = viewer.id.as_deref().unwrap_or("").trim().to_string();
    let mut names = viewer.name_candidates();
    names.resize(5, String::new());
    let limit = clamp_limit(limit);
    let sql = format!(
        "SELECT {EVENT_COLUMNS}, w.identifier, w.relation, w.workitem_id, ap.batch_key
         FROM event_workitems w
         JOIN code_events e ON e.id = w.event_id
         LEFT JOIN workitem_identifiers wi ON wi.identifier = w.identifier
         LEFT JOIN activity_posts ap
                ON ap.event_id = w.event_id AND ap.workitem_id = w.workitem_id
         WHERE w.workitem_id IS NOT NULL
           AND (
                ap.event_id IS NULL
                OR (
                    ap.status IN ('failed', 'pending')
                    AND COALESCE(ap.attempts, 0) < ?2
                    AND (ap.next_retry_at IS NULL OR ap.next_retry_at <= ?3)
                )
           )
           -- 写回范围：只处理负责人是我的工作项；rollup（父需求）额外允许
           -- 协同人 / 创建人是我，覆盖「子任务是我的、父需求与我相关」的场景。
           AND EXISTS (
                SELECT 1
                FROM workitem_identifier_people p
                WHERE p.identifier = w.identifier
                  AND (
                        (?4 <> '' AND p.person_id = ?4)
                        OR (p.person_name <> '' AND p.person_name IN (?5, ?6, ?7, ?8, ?9))
                  )
                  AND (
                        p.role = 'assignee'
                        -- 父需求（rollup）：我负责，或我是协同人 / 创建人
                        OR (w.relation = 'rollup' AND p.role IN ('participant', 'creator'))
                        -- 需求级工作项：我参与 / 我创建，也视为「与我相关」
                        OR (wi.category = 'Req' AND p.role IN ('participant', 'creator'))
                  )
           )
         ORDER BY e.occurred_at DESC, e.id DESC
         LIMIT ?1"
    );
    let mut statement = conn
        .prepare(&sql)
        .map_err(|e| format!("查询待回写候选失败: {e}"))?;
    let rows = statement
        .query_map(
            params![
                limit,
                MAX_ATTEMPTS,
                now,
                viewer_id,
                names[0],
                names[1],
                names[2],
                names[3],
                names[4]
            ],
            |row| {
            let event = event_from_row(row, 0)?;
            let workitem_id: String = row.get(15)?;
            let batch_key: Option<String> = row.get(16)?;
            Ok(ActivityCandidate {
                identifier: row.get(13)?,
                relation: row.get(14)?,
                batch_key: batch_key.or_else(|| {
                    Some(format!(
                        "{}:{}",
                        workitem_id,
                        event.occurred_at.div_euclid(86_400_000)
                    ))
                }),
                event_id: event.id.clone(),
                workitem_id,
                event,
            })
        })
        .map_err(|e| format!("查询待回写候选失败: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("读取待回写候选失败: {e}"))
}

/// 待回写候选里「已解析但还没有负责人索引」的编号（用于升级后一次性补齐人员索引）。
pub fn identifiers_missing_ownership(
    conn: &Connection,
    limit: i64,
) -> Result<Vec<String>, String> {
    let limit = limit.clamp(1, 200);
    let mut statement = conn
        .prepare(
            "SELECT DISTINCT w.identifier
             FROM event_workitems w
             JOIN workitem_identifiers wi ON wi.identifier = w.identifier
             LEFT JOIN activity_posts ap
                    ON ap.event_id = w.event_id AND ap.workitem_id = w.workitem_id
             WHERE w.workitem_id IS NOT NULL
               AND wi.workitem_id IS NOT NULL
               AND (
                    ap.event_id IS NULL
                    OR (
                        ap.status IN ('failed', 'pending')
                        AND COALESCE(ap.attempts, 0) < ?2
                    )
               )
               AND NOT EXISTS (
                    SELECT 1 FROM workitem_identifier_people p
                    WHERE p.identifier = w.identifier AND p.role = 'assignee'
               )
             ORDER BY w.identifier
             LIMIT ?1",
        )
        .map_err(|e| format!("查询缺失负责人的编号失败: {e}"))?;
    let rows = statement
        .query_map(params![limit, MAX_ATTEMPTS], |row| row.get::<_, String>(0))
        .map_err(|e| format!("读取缺失负责人的编号失败: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("读取缺失负责人的编号失败: {e}"))
}

// ---------------------------------------------------------------------------
// attribution_policy
// ---------------------------------------------------------------------------

pub fn load_policy(conn: &Connection) -> Result<ActivityPolicy, String> {
    let enabled = crate::db::get_app_setting(conn, POLICY_ENABLED_KEY)?
        .map(|value| value != "0")
        .unwrap_or(true);
    let row: Option<(String, String, i64)> = conn
        .query_row(
            "SELECT child_mode, parent_mode, max_per_day
             FROM attribution_policy WHERE scope = 'global'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
        .map_err(|e| format!("读取回写策略失败: {e}"))?;
    match row {
        Some((child_mode, parent_mode, max_per_day)) => Ok(ActivityPolicy {
            enabled,
            child_mode,
            parent_mode,
            max_per_day: max_per_day.clamp(0, 100) as u32,
        }),
        None => Ok(ActivityPolicy {
            enabled,
            ..ActivityPolicy::default()
        }),
    }
}

pub fn save_policy(conn: &Connection, policy: &ActivityPolicy) -> Result<ActivityPolicy, String> {
    let child_mode = policy.child_mode.trim();
    if !["off", "batch", "per_event"].contains(&child_mode) {
        return Err(format!(
            "子项回写策略无效: {child_mode}（允许 off/batch/per_event）"
        ));
    }
    let parent_mode = policy.parent_mode.trim();
    if !["off", "milestone", "daily"].contains(&parent_mode) {
        return Err(format!(
            "需求回写策略无效: {parent_mode}（允许 off/milestone/daily）"
        ));
    }
    if policy.max_per_day > 100 {
        return Err("每日回写上限不能超过 100".into());
    }
    let max_per_day = i64::from(policy.max_per_day);
    conn.execute(
        "INSERT INTO attribution_policy(scope, child_mode, parent_mode, max_per_day, updated_at)
         VALUES ('global', ?1, ?2, ?3, ?4)
         ON CONFLICT(scope) DO UPDATE SET
            child_mode = excluded.child_mode,
            parent_mode = excluded.parent_mode,
            max_per_day = excluded.max_per_day,
            updated_at = excluded.updated_at",
        params![child_mode, parent_mode, max_per_day, now_ms()],
    )
    .map_err(|e| format!("保存回写策略失败: {e}"))?;
    crate::db::upsert_app_setting(
        conn,
        POLICY_ENABLED_KEY,
        if policy.enabled { "1" } else { "0" },
    )?;
    load_policy(conn)
}

// ---------------------------------------------------------------------------
// workitem_identifiers 缓存（TTL 1h）
// ---------------------------------------------------------------------------

/// 读取 TTL 内的编号解析缓存（未命中/过期/负缓存过期都返回 None）。
pub fn cached_identifiers(
    conn: &Connection,
    identifiers: &[String],
    now: i64,
) -> Result<HashMap<String, ResolvedWorkitemRef>, String> {
    let mut statement = conn
        .prepare(
            "SELECT workitem_id, category, subject, parent_workitem_id, parent_identifier, error
             FROM workitem_identifiers
             WHERE identifier = ?1 AND resolved_at IS NOT NULL AND ?2 - resolved_at <= ?3",
        )
        .map_err(|e| format!("准备编号缓存查询失败: {e}"))?;
    let mut out = HashMap::new();
    for identifier in identifiers {
        let row = statement
            .query_row(params![identifier, now, IDENTIFIER_TTL_MS], |row| {
                Ok(ResolvedWorkitemRef {
                    identifier: identifier.clone(),
                    workitem_id: row.get(0)?,
                    category: row.get(1)?,
                    subject: row.get(2)?,
                    parent_workitem_id: row.get(3)?,
                    parent_identifier: row.get(4)?,
                    error: row.get(5)?,
                    assigned_to: None,
                    creator: None,
                    participants: Vec::new(),
                })
            })
            .optional()
            .map_err(|e| format!("读取编号 {identifier} 缓存失败: {e}"))?;
        if let Some(mut reference) = row {
            let (assigned_to, creator, participants) = load_identifier_people(conn, identifier)?;
            reference.assigned_to = assigned_to;
            reference.creator = creator;
            reference.participants = participants;
            out.insert(identifier.clone(), reference);
        }
    }
    Ok(out)
}

/// 工作项人员索引：(负责人, 创建人, 协同人列表)。
type IdentifierPeople = (
    Option<WorkitemPerson>,
    Option<WorkitemPerson>,
    Vec<WorkitemPerson>,
);

/// 读取工作项相关人员（assignee / creator / participants）。
fn load_identifier_people(
    conn: &Connection,
    identifier: &str,
) -> Result<IdentifierPeople, String> {
    let mut statement = conn
        .prepare(
            "SELECT role, person_id, person_name
             FROM workitem_identifier_people
             WHERE identifier = ?1",
        )
        .map_err(|e| format!("准备人员查询失败: {e}"))?;
    let rows = statement
        .query_map(params![identifier], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| format!("查询编号 {identifier} 人员失败: {e}"))?;
    let mut assigned_to = None;
    let mut creator = None;
    let mut participants = Vec::new();
    for row in rows {
        let (role, id, name) = row.map_err(|e| format!("读取编号 {identifier} 人员失败: {e}"))?;
        let person = WorkitemPerson {
            id: (!id.trim().is_empty()).then_some(id),
            name: (!name.trim().is_empty()).then_some(name),
        };
        if person.is_empty() {
            continue;
        }
        match role.as_str() {
            "assignee" => assigned_to = Some(person),
            "creator" => creator = Some(person),
            "participant" => participants.push(person),
            _ => {}
        }
    }
    Ok((assigned_to, creator, participants))
}

/// 覆盖写入某个编号的人员索引（先删后插，避免残留旧负责人）。
fn replace_identifier_people(
    conn: &Connection,
    identifier: &str,
    reference: &ResolvedWorkitemRef,
) -> Result<(), String> {
    conn.execute(
        "DELETE FROM workitem_identifier_people WHERE identifier = ?1",
        params![identifier],
    )
    .map_err(|e| format!("清理编号 {identifier} 人员索引失败: {e}"))?;

    let mut entries: Vec<(&str, &WorkitemPerson)> = Vec::new();
    if let Some(person) = reference.assigned_to.as_ref() {
        entries.push(("assignee", person));
    }
    if let Some(person) = reference.creator.as_ref() {
        entries.push(("creator", person));
    }
    for person in &reference.participants {
        entries.push(("participant", person));
    }
    if entries.is_empty() {
        return Ok(());
    }

    let mut statement = conn
        .prepare(
            "INSERT OR REPLACE INTO workitem_identifier_people
                (identifier, role, person_id, person_name)
             VALUES (?1, ?2, ?3, ?4)",
        )
        .map_err(|e| format!("准备人员写入失败: {e}"))?;
    for (role, person) in entries {
        if person.is_empty() {
            continue;
        }
        statement
            .execute(params![
                identifier,
                role,
                person.id.clone().unwrap_or_default(),
                person.name.clone().unwrap_or_default(),
            ])
            .map_err(|e| format!("写入编号 {identifier} 人员失败: {e}"))?;
    }
    Ok(())
}

/// 写入编号解析缓存（含负缓存：`workitem_id = None` + error）。
pub fn put_identifier_cache(
    conn: &Connection,
    references: &[ResolvedWorkitemRef],
    now: i64,
) -> Result<(), String> {
    let mut statement = conn
        .prepare(
            "INSERT INTO workitem_identifiers
                (identifier, workitem_id, category, subject, parent_workitem_id,
                 parent_identifier, resolved_at, error)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(identifier) DO UPDATE SET
                workitem_id = excluded.workitem_id,
                category = excluded.category,
                subject = excluded.subject,
                parent_workitem_id = excluded.parent_workitem_id,
                parent_identifier = excluded.parent_identifier,
                resolved_at = excluded.resolved_at,
                error = excluded.error",
        )
        .map_err(|e| format!("准备编号缓存写入失败: {e}"))?;
    for reference in references {
        statement
            .execute(params![
                reference.identifier,
                reference.workitem_id,
                reference.category,
                reference.subject,
                reference.parent_workitem_id,
                reference.parent_identifier,
                now,
                reference.error
            ])
            .map_err(|e| format!("写入编号 {} 缓存失败: {e}", reference.identifier))?;
        replace_identifier_people(conn, &reference.identifier, reference)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn seed_person(conn: &Connection, identifier: &str, role: &str, name: &str) {
        conn.execute(
            "INSERT OR REPLACE INTO workitem_identifier_people
                (identifier, role, person_id, person_name)
             VALUES (?1, ?2, '', ?3)",
            params![identifier, role, name],
        )
        .unwrap();
    }

    fn viewer(name: &str) -> ViewerIdentity {
        ViewerIdentity {
            id: None,
            name: Some(name.to_string()),
            aliases: Vec::new(),
        }
    }

    fn test_conn() -> Connection {
        let conn = Connection::open_in_memory().expect("内存库应可打开");
        crate::db::init_conn(&conn).expect("表结构应初始化");
        conn
    }

    fn insert_event(conn: &Connection, id: &str, repo_id: i64, occurred_at: i64, pushed: bool) {
        let payload = json!({ "sha": id });
        let event = EventInput {
            id,
            repo_id,
            kind: "commit",
            external_id: id,
            branch: Some("feature/req-1"),
            target_branch: None,
            title: "title",
            author: Some("dev"),
            occurred_at,
            source: if pushed { "remote" } else { "local" },
            pushed,
            backfilled: false,
            payload: &payload,
        };
        upsert_event(conn, &event).expect("事件应写入");
    }

    fn link<'a>(
        identifier: &'a str,
        workitem_id: Option<&'a str>,
        relation: &'a str,
    ) -> WorkitemLinkInput<'a> {
        WorkitemLinkInput {
            identifier,
            workitem_id,
            relation,
            confidence: if relation == "rollup" {
                "inherited"
            } else {
                "explicit"
            },
        }
    }

    #[test]
    fn upsert_event_deduplicates_and_flips_pushed() {
        let conn = test_conn();
        let payload = json!({ "sha": "abc" });
        let local = EventInput {
            id: "commit:1:abc",
            repo_id: 1,
            kind: "commit",
            external_id: "abc",
            branch: Some("feature/req-1"),
            target_branch: None,
            title: "local title",
            author: Some("dev"),
            occurred_at: 100,
            source: "local",
            pushed: false,
            backfilled: false,
            payload: &payload,
        };
        upsert_event(&conn, &local).unwrap();
        // 同一远端 SHA 后到：翻 pushed=true，但标题/payload 更新
        let remote = EventInput {
            title: "remote title",
            source: "remote",
            pushed: true,
            payload: &json!({ "sha": "abc", "additions": 3 }),
            ..local
        };
        upsert_event(&conn, &remote).unwrap();

        let (count, title, pushed, source, payload_text): (i64, String, i64, String, String) = conn
            .query_row(
                "SELECT COUNT(*), MAX(title), MAX(pushed), MAX(source), MAX(payload_json)
                 FROM code_events",
                [],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                    ))
                },
            )
            .unwrap();
        assert_eq!(count, 1, "唯一键去重，不得产生重复行");
        assert_eq!(title, "remote title");
        assert_eq!(pushed, 1);
        assert_eq!(source, "remote");
        assert!(payload_text.contains("additions"));
    }

    #[test]
    fn upsert_event_keeps_remote_payload_when_local_arrives_later() {
        let conn = test_conn();
        let remote = EventInput {
            id: "commit:1:abc",
            repo_id: 1,
            kind: "commit",
            external_id: "abc",
            branch: Some("main"),
            target_branch: None,
            title: "remote title",
            author: Some("dev"),
            occurred_at: 1_000,
            source: "remote",
            pushed: true,
            backfilled: true,
            payload: &json!({ "sha": "abc", "message": "remote" }),
        };
        upsert_event(&conn, &remote).unwrap();
        let local = EventInput {
            title: "local title",
            occurred_at: 0,
            source: "local",
            pushed: false,
            backfilled: false,
            payload: &json!({ "sha": "abc", "message": "local" }),
            ..remote
        };
        upsert_event(&conn, &local).unwrap();

        let (title, occurred_at, pushed, payload_text): (String, i64, i64, String) = conn
            .query_row(
                "SELECT title, occurred_at, pushed, payload_json FROM code_events",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .unwrap();
        assert_eq!(title, "local title");
        assert_eq!(occurred_at, 1_000, "0 时间不得覆盖已有时间");
        assert_eq!(pushed, 1, "远端已推送的事实不被本地事件回退");
        assert!(payload_text.contains("remote"), "保留远端更完整的 payload");
    }

    #[test]
    fn replace_event_workitems_is_idempotent() {
        let conn = test_conn();
        insert_event(&conn, "commit:1:a", 1, 100, true);
        replace_event_workitems(
            &conn,
            "commit:1:a",
            &[
                link("REQ-1", Some("wi-1"), "primary"),
                link("TASK-2", Some("wi-2"), "related"),
            ],
        )
        .unwrap();
        replace_event_workitems(
            &conn,
            "commit:1:a",
            &[link("REQ-1", Some("wi-1"), "primary")],
        )
        .unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM event_workitems", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1, "先删后插不得累积旧归属");
    }

    #[test]
    fn list_workitem_changes_orders_desc_pages_and_excludes_rollup() {
        let conn = test_conn();
        for (index, occurred_at) in [(1, 100_i64), (2, 200), (3, 300)] {
            let id = format!("commit:1:{index}");
            insert_event(&conn, &id, 1, occurred_at, true);
            replace_event_workitems(
                &conn,
                &id,
                &[
                    link("REQ-1", Some("wi-1"), "primary"),
                    link("REQ-9", Some("wi-9"), "rollup"),
                ],
            )
            .unwrap();
        }
        let page = list_workitem_changes(&conn, "wi-1", Some(2), None, false).unwrap();
        assert_eq!(page.items.len(), 2);
        assert_eq!(page.items[0].event.occurred_at, 300);
        assert_eq!(page.items[1].event.occurred_at, 200);
        assert_eq!(page.next_before, Some(200));

        let older =
            list_workitem_changes(&conn, "wi-1", Some(10), page.next_before, false).unwrap();
        assert_eq!(older.items.len(), 1);
        assert_eq!(older.items[0].event.occurred_at, 100);

        // rollup 默认隐藏，显式包含时出现
        assert!(list_workitem_changes(&conn, "wi-9", None, None, false)
            .unwrap()
            .items
            .is_empty());
        assert_eq!(
            list_workitem_changes(&conn, "wi-9", None, None, true)
                .unwrap()
                .items
                .len(),
            3
        );
    }

    #[test]
    fn list_workitem_changes_reports_activity_status() {
        let conn = test_conn();
        insert_event(&conn, "commit:1:a", 1, 100, true);
        replace_event_workitems(
            &conn,
            "commit:1:a",
            &[link("REQ-1", Some("wi-1"), "primary")],
        )
        .unwrap();
        mark_activity(&conn, "commit:1:a", "wi-1", "posted", Some("c-1"), None).unwrap();
        let page = list_workitem_changes(&conn, "wi-1", None, None, false).unwrap();
        assert_eq!(page.items[0].activity_status.as_deref(), Some("posted"));
    }

    #[test]
    fn unattributed_lists_events_without_resolved_primary() {
        let conn = test_conn();
        insert_event(&conn, "commit:1:a", 1, 100, true);
        // 有 primary 且已解析 → 不属于待归属
        replace_event_workitems(
            &conn,
            "commit:1:a",
            &[link("REQ-1", Some("wi-1"), "primary")],
        )
        .unwrap();
        // 有 primary 但 workitem_id 为 NULL → 仍待归属
        insert_event(&conn, "commit:1:b", 1, 200, true);
        replace_event_workitems(&conn, "commit:1:b", &[link("REQ-2", None, "primary")]).unwrap();
        // 完全没有归属 → 待归属
        insert_event(&conn, "commit:2:c", 2, 300, true);

        let page = list_unattributed_changes(&conn, None, None).unwrap();
        let ids: Vec<_> = page
            .items
            .iter()
            .map(|item| item.event.id.clone())
            .collect();
        assert_eq!(ids, vec!["commit:2:c", "commit:1:b"]);
        assert_eq!(page.items[1].identifier, "REQ-2");

        let repo1 = list_unattributed_changes(&conn, Some(1), None).unwrap();
        assert_eq!(repo1.items.len(), 1);
        assert_eq!(repo1.items[0].event.id, "commit:1:b");
    }

    #[test]
    fn assign_change_workitem_replaces_primary_with_manual_confidence() {
        let conn = test_conn();
        insert_event(&conn, "commit:1:a", 1, 100, true);
        replace_event_workitems(
            &conn,
            "commit:1:a",
            &[link("REQ-1", Some("wi-1"), "primary")],
        )
        .unwrap();
        assign_change_workitem(&conn, "commit:1:a", "wi-2", Some("primary")).unwrap();

        let rows: Vec<(String, Option<String>, String)> = {
            let mut statement = conn
                .prepare(
                    "SELECT identifier, workitem_id, confidence FROM event_workitems
                     WHERE event_id = 'commit:1:a' AND relation = 'primary' ORDER BY identifier",
                )
                .unwrap();
            let rows = statement
                .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
                .unwrap();
            rows.map(Result::unwrap).collect()
        };
        // 编号缓存没有该 workitemId 时沿用事件原有标识符，避免人工指派把 REQ-1 变成裸 ID
        assert_eq!(
            rows,
            vec![(
                "REQ-1".to_string(),
                Some("wi-2".to_string()),
                "manual".to_string()
            )]
        );

        assert!(assign_change_workitem(&conn, "missing", "wi-2", None).is_err());
        assert!(assign_change_workitem(&conn, "commit:1:a", "wi-2", Some("bogus")).is_err());

        // 完全没有既有归属时退回 workitemId 作为标识符
        insert_event(&conn, "commit:1:b", 1, 200, true);
        assign_change_workitem(&conn, "commit:1:b", "wi-9", None).unwrap();
        let identifier: String = conn
            .query_row(
                "SELECT identifier FROM event_workitems WHERE event_id = 'commit:1:b' AND relation = 'primary'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(identifier, "wi-9");
    }

    #[test]
    fn replace_event_workitems_can_run_inside_sync_transaction() {
        let conn = test_conn();
        insert_event(&conn, "commit:1:a", 1, 100, true);
        insert_event(&conn, "commit:1:b", 1, 200, true);
        // 模拟 sync 的仓库级事务：内部不得再次 BEGIN
        let transaction = conn.unchecked_transaction().unwrap();
        replace_event_workitems(
            &transaction,
            "commit:1:a",
            &[link("REQ-1", Some("wi-1"), "primary")],
        )
        .unwrap();
        replace_event_workitems(
            &transaction,
            "commit:1:b",
            &[link("REQ-2", Some("wi-2"), "primary")],
        )
        .unwrap();
        transaction.commit().unwrap();

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM event_workitems", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 2, "外层事务内两次替换都应落库");
    }

    #[test]
    fn activity_candidates_skip_posted_and_honour_retry_backoff() {
        let conn = test_conn();
        insert_event(&conn, "commit:1:a", 1, 100, true);
        replace_event_workitems(
            &conn,
            "commit:1:a",
            &[link("REQ-1", Some("wi-1"), "primary")],
        )
        .unwrap();
        insert_event(&conn, "commit:1:b", 1, 200, true);
        replace_event_workitems(
            &conn,
            "commit:1:b",
            &[
                link("REQ-1", Some("wi-1"), "primary"),
                link("REQ-9", Some("wi-9"), "rollup"),
            ],
        )
        .unwrap();

        // 写回范围：REQ-1 的负责人是我；REQ-9 是父需求，协同人是我（rollup 允许协同人）。
        seed_person(&conn, "REQ-1", "assignee", "dev");
        seed_person(&conn, "REQ-9", "participant", "dev");
        let viewer = viewer("dev");

        // rollup 也进入候选：父需求的里程碑/日报由前端 writer 过滤，不能让父需求永远收不到动态
        let candidates = list_activity_candidates(&conn, None, now_ms(), Some(&viewer)).unwrap();
        assert_eq!(candidates.len(), 3);
        assert_eq!(
            candidates.iter().filter(|c| c.relation == "primary").count(),
            2
        );
        assert!(candidates
            .iter()
            .any(|c| c.relation == "rollup" && c.workitem_id == "wi-9"));
        assert!(candidates.iter().all(|c| c.batch_key.is_some()));

        // posted 之后不再候选（rollup 仍待回写）
        mark_activity(&conn, "commit:1:a", "wi-1", "posted", Some("c-1"), None).unwrap();
        let candidates = list_activity_candidates(&conn, None, now_ms(), Some(&viewer)).unwrap();
        assert_eq!(candidates.len(), 2);
        assert!(candidates.iter().all(|c| c.event_id == "commit:1:b"));

        // failed 未到重试时间不候选；到点后恢复候选；rollup 不受 primary 退避影响
        mark_activity(&conn, "commit:1:b", "wi-1", "failed", None, Some("boom")).unwrap();
        let candidates = list_activity_candidates(&conn, None, now_ms(), Some(&viewer)).unwrap();
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].relation, "rollup");
        assert_eq!(
            list_activity_candidates(&conn, None, now_ms() + 61_000, Some(&viewer))
                .unwrap()
                .len(),
            2
        );

        // 连续失败 3 次后 primary 彻底放弃；rollup 仍可回写
        mark_activity(&conn, "commit:1:b", "wi-1", "failed", None, Some("boom")).unwrap();
        mark_activity(&conn, "commit:1:b", "wi-1", "failed", None, Some("boom")).unwrap();
        let candidates =
            list_activity_candidates(&conn, None, now_ms() + 86_400_000, Some(&viewer)).unwrap();
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].relation, "rollup");
    }

    #[test]
    fn activity_candidates_are_scoped_to_my_workitems() {
        let conn = test_conn();
        insert_event(&conn, "commit:1:a", 1, 100, true);
        replace_event_workitems(
            &conn,
            "commit:1:a",
            &[
                link("REQ-1", Some("wi-1"), "primary"), // 负责人是我
                link("REQ-2", Some("wi-2"), "primary"), // 负责人是别人
                link("REQ-3", Some("wi-3"), "rollup"),  // 父需求，我是协同人
                link("TASK-4", Some("wi-4"), "related"), // 无负责人索引（未知）
                link("REQ-5", Some("wi-5"), "primary"), // 需求级，我是协同人
            ],
        )
        .unwrap();
        // 需求级工作项需要 category=Req 才能命中「与我相关」规则。
        put_identifier_cache(
            &conn,
            &[ResolvedWorkitemRef {
                identifier: "REQ-5".into(),
                workitem_id: Some("wi-5".into()),
                category: Some("Req".into()),
                subject: None,
                parent_workitem_id: None,
                parent_identifier: None,
                error: None,
                assigned_to: None,
                creator: None,
                participants: Vec::new(),
            }],
            now_ms(),
        )
        .unwrap();
        seed_person(&conn, "REQ-1", "assignee", "dev");
        seed_person(&conn, "REQ-2", "assignee", "other");
        seed_person(&conn, "REQ-3", "participant", "dev");
        seed_person(&conn, "REQ-5", "participant", "dev");

        let scoped = |viewer: &ViewerIdentity| -> Vec<String> {
            let mut identifiers: Vec<String> =
                list_activity_candidates(&conn, None, now_ms(), Some(viewer))
                    .unwrap()
                    .into_iter()
                    .map(|candidate| candidate.identifier)
                    .collect();
            identifiers.sort();
            identifiers
        };

        // 我的子项/需求 + 我参与的父需求；别人的、以及负责人未知的一律不回写。
        assert_eq!(scoped(&viewer("dev")), vec!["REQ-1", "REQ-3", "REQ-5"]);
        // 别人的父需求：协同人不是他，不写。
        assert_eq!(scoped(&viewer("other")), vec!["REQ-2"]);
        // 没有身份时 fail-closed。
        assert!(list_activity_candidates(&conn, None, now_ms(), None)
            .unwrap()
            .is_empty());
        // 只有 ID 没有姓名的人员行，不能被「姓名空」的 viewer 误命中（REQ-6）。
        replace_event_workitems(
            &conn,
            "commit:1:a",
            &[
                link("REQ-1", Some("wi-1"), "primary"),
                link("REQ-2", Some("wi-2"), "primary"),
                link("REQ-3", Some("wi-3"), "rollup"),
                link("TASK-4", Some("wi-4"), "related"),
                link("REQ-5", Some("wi-5"), "primary"),
                link("REQ-6", Some("wi-6"), "primary"),
            ],
        )
        .unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO workitem_identifier_people
                (identifier, role, person_id, person_name)
             VALUES ('REQ-6', 'assignee', 'u-other', '')",
            [],
        )
        .unwrap();
        let id_only = ViewerIdentity {
            id: Some("u-me".into()),
            name: None,
            aliases: Vec::new(),
        };
        assert!(
            !scoped(&id_only).contains(&"REQ-6".to_string()),
            "姓名留空的人员行不得被空姓名误命中"
        );

        // 只有别名、没有姓名/ID 也算有效身份（设置里的自定义花名）。
        let alias_only = ViewerIdentity {
            id: None,
            name: None,
            aliases: vec!["花名".into()],
        };
        assert!(list_activity_candidates(&conn, None, now_ms(), Some(&alias_only))
            .unwrap()
            .is_empty());
    }

    #[test]
    fn backfill_marks_activity_skipped_without_overwriting_existing() {
        let conn = test_conn();
        insert_event(&conn, "commit:1:a", 1, 100, true);
        replace_event_workitems(
            &conn,
            "commit:1:a",
            &[
                link("REQ-1", Some("wi-1"), "primary"),
                link("REQ-9", Some("wi-9"), "rollup"),
            ],
        )
        .unwrap();
        mark_activity(&conn, "commit:1:a", "wi-1", "posted", Some("c-1"), None).unwrap();
        mark_event_activity_skipped(&conn, "commit:1:a").unwrap();

        let status: String = conn
            .query_row(
                "SELECT status FROM activity_posts WHERE event_id = 'commit:1:a' AND workitem_id = 'wi-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(status, "posted", "已有记账不被 skipped 覆盖");
        let rollup_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM activity_posts WHERE workitem_id = 'wi-9'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(rollup_count, 0, "rollup 不打回写记账");
    }

    #[test]
    fn policy_defaults_and_roundtrip() {
        let conn = test_conn();
        let policy = load_policy(&conn).unwrap();
        assert!(policy.enabled);
        assert_eq!(policy.child_mode, "batch");
        assert_eq!(policy.parent_mode, "milestone");
        assert_eq!(policy.max_per_day, 5);

        let saved = save_policy(
            &conn,
            &ActivityPolicy {
                enabled: false,
                child_mode: "per_event".into(),
                parent_mode: "daily".into(),
                max_per_day: 2,
            },
        )
        .unwrap();
        assert!(!saved.enabled);
        assert_eq!(saved.child_mode, "per_event");
        assert_eq!(saved.parent_mode, "daily");
        assert_eq!(saved.max_per_day, 2);
        assert_eq!(load_policy(&conn).unwrap().child_mode, "per_event");

        assert!(save_policy(
            &conn,
            &ActivityPolicy {
                child_mode: "sometimes".into(),
                ..ActivityPolicy::default()
            }
        )
        .is_err());
        assert!(save_policy(
            &conn,
            &ActivityPolicy {
                max_per_day: 1000,
                ..ActivityPolicy::default()
            }
        )
        .is_err());
    }

    #[test]
    fn identifier_cache_respects_ttl_and_negative_entries() {
        let conn = test_conn();
        let now = 10_000_i64;
        let refs = vec![
            ResolvedWorkitemRef {
                identifier: "REQ-1".into(),
                workitem_id: Some("wi-1".into()),
                category: Some("Req".into()),
                subject: Some("需求".into()),
                parent_workitem_id: None,
                parent_identifier: None,
                error: None,
                assigned_to: None,
                creator: None,
                participants: Vec::new(),
            },
            ResolvedWorkitemRef {
                identifier: "REQ-404".into(),
                workitem_id: None,
                category: Some("Req".into()),
                subject: None,
                parent_workitem_id: None,
                parent_identifier: None,
                error: Some("未找到".into()),
                assigned_to: None,
                creator: None,
                participants: Vec::new(),
            },
        ];
        put_identifier_cache(&conn, &refs, now).unwrap();

        let hit = cached_identifiers(&conn, &["REQ-1".into(), "REQ-404".into()], now + 10).unwrap();
        assert_eq!(hit["REQ-1"].workitem_id.as_deref(), Some("wi-1"));
        assert!(hit["REQ-404"].workitem_id.is_none());
        assert!(
            hit["REQ-404"].error.is_some(),
            "负缓存也要命中，避免反复请求"
        );

        let expired =
            cached_identifiers(&conn, &["REQ-1".into()], now + IDENTIFIER_TTL_MS + 1).unwrap();
        assert!(expired.is_empty(), "超过 TTL 应重新解析");

        assert_eq!(
            identifier_for_workitem(&conn, "wi-1").unwrap().as_deref(),
            Some("REQ-1")
        );
    }

    #[test]
    fn sync_state_roundtrip_and_status() {
        let conn = test_conn();
        assert!(get_sync_state(&conn, 7, "main").unwrap().is_none());
        save_sync_state(&conn, 7, "main", Some("123"), Some(999), 1000, None).unwrap();
        let state = get_sync_state(&conn, 7, "main").unwrap().unwrap();
        assert_eq!(state.cursor.as_deref(), Some("123"));
        assert_eq!(state.backfilled_at, Some(999));

        // 只更新 last_sync 不覆盖 cursor/backfilled
        save_sync_state(&conn, 7, "main", None, None, 2000, Some("oops")).unwrap();
        let state = get_sync_state(&conn, 7, "main").unwrap().unwrap();
        assert_eq!(state.cursor.as_deref(), Some("123"));
        assert_eq!(state.backfilled_at, Some(999));

        save_sync_state(&conn, 7, "*", Some("123"), None, 2000, None).unwrap();
        let status = attribution_status(&conn, true).unwrap();
        assert!(status.syncing);
        assert_eq!(status.repos.len(), 1);
        assert_eq!(status.repos[0].repo_id, 7);
        assert_eq!(status.repos[0].last_sync_at, Some(2000));
        assert_eq!(status.repos[0].cursor.as_deref(), Some("123"));
    }
}
