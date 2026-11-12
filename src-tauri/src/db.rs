//! 阶段3 SQLite 数据层：设置与分支轨道行级持久化（nervd.db）
//!
//! 三张表：
//! - `app_settings`：标量/列表型设置键（camelCase 键名与 `Settings` 字段一致）+ `schema_version` 等元键
//! - `branch_tracks`：分支规则轨道（`global` / `iteration` 两种 scope）
//! - `workitem_repo_bindings`：需求×仓库 → 轨道绑定（轨道被删时 FK 置空 = 回退继承全局模板）
//!
//! 核心逻辑拆成 `init_conn` / `migrate_from_settings` 等可脱离 AppHandle 的纯函数，`open_db` 只做胶水。

use crate::credentials::{self, BranchRuleTemplate, Settings, SettingsPatch};
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

const SCHEMA_VERSION: i64 = 1;
const KEY_SCHEMA_VERSION: &str = "schema_version";
const KEY_LOCAL_STORAGE_IMPORTED: &str = "localStorageImported";

pub fn open_db(app: &tauri::AppHandle) -> Result<Connection, String> {
    let path = db_path(app)?;
    let conn = Connection::open(&path)
        .map_err(|e| format!("打开 nervd.db 失败 ({}): {e}", path.display()))?;
    init_conn(&conn)?;
    Ok(conn)
}

/// 库文件绝对路径（启动自愈也用它定位 WAL/SHM 伴生文件）
pub fn db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(credentials::data_dir(app)?.join("nervd.db"))
}

fn corrupt_suffix() -> String {
    chrono::Local::now().format("%Y%m%d-%H%M%S").to_string()
}

/// 启动自愈：把损坏的库（含 `-wal` / `-shm` 伴生文件）改名为 `.corrupt-<时间戳>`。
/// 库文件不存在时返回 `Ok(None)`（无可备份）。伴生文件改名失败只告警并尝试删除，
/// 不阻断重建流程。
pub fn backup_corrupt_db(app: &tauri::AppHandle) -> Result<Option<PathBuf>, String> {
    let path = db_path(app)?;
    if !path.is_file() {
        return Ok(None);
    }
    let suffix = corrupt_suffix();
    let backup = path.with_file_name(format!("nervd.db.corrupt-{suffix}"));
    std::fs::rename(&path, &backup).map_err(|e| {
        format!(
            "备份损坏数据库失败 ({} → {}): {e}",
            path.display(),
            backup.display()
        )
    })?;
    for ext in ["-wal", "-shm"] {
        let from = path.with_file_name(format!("nervd.db{ext}"));
        if !from.is_file() {
            continue;
        }
        let to = backup.with_file_name(format!("nervd.db.corrupt-{suffix}{ext}"));
        if std::fs::rename(&from, &to).is_err() && std::fs::remove_file(&from).is_err() {
            eprintln!("[db] 无法移走旧的 WAL/SHM 伴生文件 {}", from.display());
        }
    }
    Ok(Some(backup))
}

/// 启动自愈：把无法解析的 settings.json（新数据目录优先，其次旧目录）改名为
/// `.corrupt-<时间戳>`，返回备份路径；不存在时返回 `Ok(None)`。
pub fn quarantine_settings_json(app: &tauri::AppHandle) -> Result<Option<PathBuf>, String> {
    let mut candidates = vec![credentials::data_dir(app)?.join("settings.json")];
    if let Ok(legacy_dir) = credentials::legacy_data_dir(app) {
        candidates.push(legacy_dir.join("settings.json"));
    }
    let Some(path) = candidates.into_iter().find(|path| path.is_file()) else {
        return Ok(None);
    };
    let backup = path.with_file_name(format!("settings.json.corrupt-{}", corrupt_suffix()));
    std::fs::rename(&path, &backup).map_err(|e| {
        format!(
            "隔离损坏的 settings.json 失败 ({} → {}): {e}",
            path.display(),
            backup.display()
        )
    })?;
    Ok(Some(backup))
}

/// 建表 + PRAGMA（journal_mode=WAL / busy_timeout=5000 / foreign_keys=ON），可单测
pub fn init_conn(conn: &Connection) -> Result<(), String> {
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| format!("设置 journal_mode=WAL 失败: {e}"))?;
    conn.pragma_update(None, "busy_timeout", 5_000_i64)
        .map_err(|e| format!("设置 busy_timeout 失败: {e}"))?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|e| format!("设置 foreign_keys=ON 失败: {e}"))?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS branch_tracks (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            scope TEXT NOT NULL CHECK(scope IN ('global','iteration')),
            iteration_id TEXT,
            source_branch TEXT NOT NULL,
            baseline_pattern TEXT NOT NULL,
            workitem_pattern TEXT NOT NULL,
            is_default INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS workitem_repo_bindings (
            workitem_id TEXT NOT NULL,
            repo_id INTEGER NOT NULL,
            track_id TEXT NULL,
            PRIMARY KEY(workitem_id, repo_id),
            FOREIGN KEY(track_id) REFERENCES branch_tracks(id) ON DELETE SET NULL
        );",
    )
    .map_err(|e| format!("初始化 nervd.db 表结构失败: {e}"))?;
    Ok(())
}

/// 一次性迁移：settings.json → nervd.db（幂等：`schema_version` 已存在即跳过）
pub fn migrate_if_needed(conn: &mut Connection, app: &tauri::AppHandle) -> Result<(), String> {
    migrate_if_needed_with(conn, locate_settings_json(app)?)
}

/// `migrate_if_needed` 的可测内核：`located` 为找到的 settings.json 路径（None = 全新安装）
fn migrate_if_needed_with(conn: &mut Connection, located: Option<PathBuf>) -> Result<(), String> {
    if get_app_setting(conn, KEY_SCHEMA_VERSION)?.is_some() {
        return Ok(());
    }
    match located {
        Some(path) => {
            let settings = read_settings_file(&path)?;
            migrate_from_settings(conn, &settings, &path)
        }
        None => upsert_app_setting(conn, KEY_SCHEMA_VERSION, &SCHEMA_VERSION.to_string()),
    }
}

fn read_settings_file(path: &Path) -> Result<Settings, String> {
    let text = std::fs::read_to_string(path)
        .map_err(|e| format!("读取 settings.json 失败 ({}): {e}", path.display()))?;
    let mut settings: Settings = serde_json::from_str(&text)
        .map_err(|e| format!("解析 settings.json 失败 ({}): {e}", path.display()))?;
    // 与 credentials::load_settings 保持一致的一次性正则升级
    if settings.link_pattern == credentials::LEGACY_LINK_PATTERN {
        settings.link_pattern = credentials::DEFAULT_LINK_PATTERN.to_string();
    }
    Ok(settings)
}

/// 定位 legacy settings.json：新数据目录优先，其次旧目录（复用 credentials 现有路径函数）
fn locate_settings_json(app: &tauri::AppHandle) -> Result<Option<PathBuf>, String> {
    let new_path = credentials::data_dir(app)?.join("settings.json");
    if new_path.is_file() {
        return Ok(Some(new_path));
    }
    if let Ok(legacy_dir) = credentials::legacy_data_dir(app) {
        let legacy_path = legacy_dir.join("settings.json");
        if legacy_path.is_file() {
            return Ok(Some(legacy_path));
        }
    }
    Ok(None)
}

/// 全量导入 `Settings` 并把 settings.json 重命名为 .bak（可脱离 AppHandle 单测）。
/// 事务提交成功后才改名；任何一步失败返回 Err 且不改名。已存在的 .bak 会被覆盖。
pub fn migrate_from_settings(
    conn: &mut Connection,
    settings: &Settings,
    path: &Path,
) -> Result<(), String> {
    {
        let tx = conn
            .transaction()
            .map_err(|e| format!("开启迁移事务失败: {e}"))?;
        upsert_plain_settings(&tx, settings)?;
        for (index, template) in settings.branch_rule_templates.iter().enumerate() {
            upsert_track(&tx, template, "global", None, index as i64)?;
        }
        for (workitem_id, repos) in &settings.workitem_repo_branch_templates {
            for (repo_id, track_id) in repos {
                // track_id 可能指向不存在的轨道（历史遗留的迭代专属模板），校验存在否则跳过
                if !track_exists(&tx, track_id)? {
                    continue;
                }
                tx.execute(
                    "INSERT OR REPLACE INTO workitem_repo_bindings(workitem_id, repo_id, track_id)
                     VALUES (?1, ?2, ?3)",
                    params![workitem_id, repo_id, track_id],
                )
                .map_err(|e| format!("迁移分支模板绑定失败: {e}"))?;
            }
        }
        upsert_app_setting(&tx, KEY_SCHEMA_VERSION, &SCHEMA_VERSION.to_string())?;
        tx.commit().map_err(|e| format!("提交迁移事务失败: {e}"))?;
    }
    let bak = path.with_file_name("settings.json.bak");
    std::fs::rename(path, &bak).map_err(|e| {
        format!(
            "迁移已入库但 settings.json 重命名失败 ({} → {}): {e}",
            path.display(),
            bak.display()
        )
    })?;
    Ok(())
}

// ---------- 读组装 ----------

/// 从 db 组装完整 `Settings`：app_settings 各键反序列化 + 全局轨道 + 绑定
pub fn load_settings(conn: &Connection) -> Result<Settings, String> {
    // 用结构体字面量一次性构造，避免 clippy::field_reassign_with_default
    let mut settings = Settings {
        organization_id: read_key(conn, "organizationId")?,
        default_space_identifier: read_key(conn, "defaultSpaceIdentifier")?,
        link_pattern: read_key(conn, "linkPattern")?,
        watched_repos: read_key(conn, "watchedRepos")?,
        allow_write_ops: read_key(conn, "allowWriteOps")?,
        workitem_repos: read_key(conn, "workitemRepos")?,
        jenkins_connections: read_key(conn, "jenkinsConnections")?,
        repo_ci_bindings: read_key(conn, "repoCiBindings")?,
        ..Settings::default()
    };
    // 轨道与绑定来自独立表，不能写进上面的字面量（需要先执行查询）
    settings.branch_rule_templates = global_tracks(conn)?;
    settings.workitem_repo_branch_templates = load_bindings(conn)?;
    Ok(settings)
}

fn read_key<T: serde::de::DeserializeOwned + Default>(
    conn: &Connection,
    key: &str,
) -> Result<T, String> {
    match get_app_setting(conn, key)? {
        None => Ok(T::default()),
        // 单键 JSON 损坏（历史版本写坏 / 手工编辑）不得让整个应用启动失败：
        // 记录日志并回退默认值，其余键继续正常加载。
        Some(text) => match serde_json::from_str(&text) {
            Ok(value) => Ok(value),
            Err(e) => {
                eprintln!("[db] app_settings[{key}] 反序列化失败，回退默认值: {e}");
                Ok(T::default())
            }
        },
    }
}

/// 只写入 `SettingsPatch` 中显式提供的键；未提供的键在库中原值保持不变。
/// 轨道/绑定是行级表数据，由调用方走独立命令，不在此处理。
pub fn upsert_settings_patch(conn: &Connection, patch: &SettingsPatch) -> Result<(), String> {
    if let Some(value) = &patch.organization_id {
        write_key(conn, "organizationId", value)?;
    }
    if let Some(value) = &patch.default_space_identifier {
        write_key(conn, "defaultSpaceIdentifier", value)?;
    }
    if let Some(value) = &patch.link_pattern {
        write_key(conn, "linkPattern", value)?;
    }
    if let Some(value) = &patch.watched_repos {
        write_key(conn, "watchedRepos", value)?;
    }
    if let Some(value) = &patch.allow_write_ops {
        write_key(conn, "allowWriteOps", value)?;
    }
    if let Some(value) = &patch.workitem_repos {
        write_key(conn, "workitemRepos", value)?;
    }
    if let Some(value) = &patch.jenkins_connections {
        write_key(conn, "jenkinsConnections", value)?;
    }
    if let Some(value) = &patch.repo_ci_bindings {
        write_key(conn, "repoCiBindings", value)?;
    }
    Ok(())
}

pub fn get_app_setting(conn: &Connection, key: &str) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT value FROM app_settings WHERE key = ?1",
        params![key],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .map_err(|e| format!("读取 app_settings[{key}] 失败: {e}"))
}

/// localStorage 遗留数据是否已一次性导入（幂等标记）
pub fn local_storage_imported(conn: &Connection) -> Result<bool, String> {
    Ok(get_app_setting(conn, KEY_LOCAL_STORAGE_IMPORTED)?.as_deref() == Some("1"))
}

/// 标记 localStorage 遗留数据已完成一次性导入
pub fn mark_local_storage_imported(conn: &Connection) -> Result<(), String> {
    upsert_app_setting(conn, KEY_LOCAL_STORAGE_IMPORTED, "1")
}

const TRACK_COLUMNS: &str = "id, name, source_branch, baseline_pattern, workitem_pattern";

/// 全局轨道（scope='global'，ORDER BY sort_order）→ Settings.branchRuleTemplates
pub fn global_tracks(conn: &Connection) -> Result<Vec<BranchRuleTemplate>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {TRACK_COLUMNS} FROM branch_tracks WHERE scope = 'global' ORDER BY sort_order"
        ))
        .map_err(|e| format!("读取全局轨道失败: {e}"))?;
    let rows = stmt
        .query_map([], row_to_template)
        .map_err(|e| format!("读取全局轨道失败: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("读取全局轨道失败: {e}"))
}

/// 指定迭代的轨道（ORDER BY sort_order），供 list_iteration_tracks 命令使用
pub fn iteration_tracks(
    conn: &Connection,
    iteration_id: &str,
) -> Result<Vec<BranchRuleTemplate>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {TRACK_COLUMNS} FROM branch_tracks
             WHERE scope = 'iteration' AND iteration_id = ?1 ORDER BY sort_order"
        ))
        .map_err(|e| format!("读取迭代轨道失败: {e}"))?;
    let rows = stmt
        .query_map(params![iteration_id], row_to_template)
        .map_err(|e| format!("读取迭代轨道失败: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("读取迭代轨道失败: {e}"))
}

fn row_to_template(row: &rusqlite::Row<'_>) -> rusqlite::Result<BranchRuleTemplate> {
    Ok(BranchRuleTemplate {
        id: row.get(0)?,
        name: row.get(1)?,
        source_branch: row.get(2)?,
        baseline_branch_pattern: row.get(3)?,
        workitem_branch_pattern: row.get(4)?,
    })
}

/// 绑定 → Settings.workitemRepoBranchTemplates；track_id 为 NULL 的行 = 已回退继承，不呈现
fn load_bindings(conn: &Connection) -> Result<HashMap<String, HashMap<i64, String>>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT workitem_id, repo_id, track_id FROM workitem_repo_bindings
             WHERE track_id IS NOT NULL",
        )
        .map_err(|e| format!("读取分支模板绑定失败: {e}"))?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| format!("读取分支模板绑定失败: {e}"))?;
    let mut bindings: HashMap<String, HashMap<i64, String>> = HashMap::new();
    for row in rows {
        let (workitem_id, repo_id, track_id) =
            row.map_err(|e| format!("读取分支模板绑定失败: {e}"))?;
        bindings
            .entry(workitem_id)
            .or_default()
            .insert(repo_id, track_id);
    }
    Ok(bindings)
}

pub fn track_exists(conn: &Connection, track_id: &str) -> Result<bool, String> {
    conn.query_row(
        "SELECT 1 FROM branch_tracks WHERE id = ?1",
        params![track_id],
        |_| Ok(()),
    )
    .optional()
    .map(|found| found.is_some())
    .map_err(|e| format!("查询轨道 {track_id} 失败: {e}"))
}

// ---------- 行级写助手 ----------

pub fn upsert_app_setting(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO app_settings(key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map(|_| ())
    .map_err(|e| format!("写入 app_settings[{key}] 失败: {e}"))
}

fn write_key<T: serde::Serialize>(conn: &Connection, key: &str, value: &T) -> Result<(), String> {
    let text = serde_json::to_string(value)
        .map_err(|e| format!("序列化 app_settings[{key}] 失败: {e}"))?;
    upsert_app_setting(conn, key, &text)
}

/// 把 `Settings` 中的非轨道/非绑定键写入 app_settings（value = JSON 字符串；
/// 键名用 camelCase 与 Settings 字段一致，`branchRuleTemplates` / `workitemRepoBranchTemplates`
/// 走行级表，不在此列）
pub fn upsert_plain_settings(conn: &Connection, settings: &Settings) -> Result<(), String> {
    write_key(conn, "organizationId", &settings.organization_id)?;
    write_key(conn, "defaultSpaceIdentifier", &settings.default_space_identifier)?;
    write_key(conn, "linkPattern", &settings.link_pattern)?;
    write_key(conn, "watchedRepos", &settings.watched_repos)?;
    write_key(conn, "allowWriteOps", &settings.allow_write_ops)?;
    write_key(conn, "workitemRepos", &settings.workitem_repos)?;
    write_key(conn, "jenkinsConnections", &settings.jenkins_connections)?;
    write_key(conn, "repoCiBindings", &settings.repo_ci_bindings)?;
    Ok(())
}

/// UPSERT 单条轨道（ON CONFLICT 更新不触发 FK 动作，保留既有绑定）
#[allow(clippy::too_many_arguments)]
fn upsert_track(
    conn: &Connection,
    template: &BranchRuleTemplate,
    scope: &str,
    iteration_id: Option<&str>,
    sort_order: i64,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO branch_tracks
            (id, name, scope, iteration_id, source_branch, baseline_pattern, workitem_pattern, is_default, sort_order)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, ?8)
         ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            scope = excluded.scope,
            iteration_id = excluded.iteration_id,
            source_branch = excluded.source_branch,
            baseline_pattern = excluded.baseline_pattern,
            workitem_pattern = excluded.workitem_pattern,
            is_default = excluded.is_default,
            sort_order = excluded.sort_order",
        params![
            template.id,
            template.name,
            scope,
            iteration_id,
            template.source_branch,
            template.baseline_branch_pattern,
            template.workitem_branch_pattern,
            sort_order
        ],
    )
    .map(|_| ())
    .map_err(|e| format!("写入轨道 {} 失败: {e}", template.id))
}

/// 行级替换全局轨道：仅删除不在新集合中的轨道（被删轨道的绑定由 FK SET NULL 置空 = 回退继承），
/// 保留轨道走 UPSERT，绑定不受影响。sort_order = 下标。
pub fn replace_global_tracks(
    conn: &mut Connection,
    templates: &[BranchRuleTemplate],
) -> Result<(), String> {
    let tx = conn
        .transaction()
        .map_err(|e| format!("开启全局轨道写入事务失败: {e}"))?;
    delete_removed_global_tracks(&tx, templates)?;
    for (index, template) in templates.iter().enumerate() {
        upsert_track(&tx, template, "global", None, index as i64)?;
    }
    tx.commit()
        .map_err(|e| format!("提交全局轨道写入失败: {e}"))
}

/// 行级替换某迭代的轨道：只影响目标迭代，其他迭代轨道不动
pub fn replace_iteration_tracks(
    conn: &mut Connection,
    iteration_id: &str,
    templates: &[BranchRuleTemplate],
) -> Result<(), String> {
    let tx = conn
        .transaction()
        .map_err(|e| format!("开启迭代轨道写入事务失败: {e}"))?;
    delete_removed_iteration_tracks(&tx, iteration_id, templates)?;
    for (index, template) in templates.iter().enumerate() {
        upsert_track(&tx, template, "iteration", Some(iteration_id), index as i64)?;
    }
    tx.commit()
        .map_err(|e| format!("提交迭代轨道写入失败: {e}"))
}

fn delete_removed_global_tracks(
    conn: &Connection,
    templates: &[BranchRuleTemplate],
) -> Result<(), String> {
    let result = if templates.is_empty() {
        conn.execute("DELETE FROM branch_tracks WHERE scope = 'global'", [])
    } else {
        let ids: Vec<&str> = templates.iter().map(|t| t.id.as_str()).collect();
        let placeholders = vec!["?"; ids.len()].join(", ");
        let sql =
            format!("DELETE FROM branch_tracks WHERE scope = 'global' AND id NOT IN ({placeholders})");
        conn.execute(&sql, rusqlite::params_from_iter(ids))
    };
    result
        .map(|_| ())
        .map_err(|e| format!("清理已删除的全局轨道失败: {e}"))
}

fn delete_removed_iteration_tracks(
    conn: &Connection,
    iteration_id: &str,
    templates: &[BranchRuleTemplate],
) -> Result<(), String> {
    let result = if templates.is_empty() {
        conn.execute(
            "DELETE FROM branch_tracks WHERE scope = 'iteration' AND iteration_id = ?1",
            params![iteration_id],
        )
    } else {
        let ids: Vec<&str> = templates.iter().map(|t| t.id.as_str()).collect();
        let placeholders = vec!["?"; ids.len()].join(", ");
        let sql = format!(
            "DELETE FROM branch_tracks WHERE scope = 'iteration' AND iteration_id = ?1 AND id NOT IN ({placeholders})"
        );
        let values: Vec<&str> = std::iter::once(iteration_id)
            .chain(ids)
            .collect();
        conn.execute(&sql, rusqlite::params_from_iter(values))
    };
    result
        .map(|_| ())
        .map_err(|e| format!("清理已删除的迭代轨道失败: {e}"))
}

/// 单行绑定 UPSERT；track_id 为 None 时等价删除该行
pub fn upsert_binding(
    conn: &Connection,
    workitem_id: &str,
    repo_id: i64,
    track_id: Option<&str>,
) -> Result<(), String> {
    let result = match track_id {
        Some(track_id) => conn.execute(
            "INSERT INTO workitem_repo_bindings(workitem_id, repo_id, track_id) VALUES (?1, ?2, ?3)
             ON CONFLICT(workitem_id, repo_id) DO UPDATE SET track_id = excluded.track_id",
            params![workitem_id, repo_id, track_id],
        ),
        None => conn.execute(
            "DELETE FROM workitem_repo_bindings WHERE workitem_id = ?1 AND repo_id = ?2",
            params![workitem_id, repo_id],
        ),
    };
    result
        .map(|_| ())
        .map_err(|e| format!("写入分支模板绑定失败 ({workitem_id}#{repo_id}): {e}"))
}

pub fn delete_binding(conn: &Connection, workitem_id: &str, repo_id: i64) -> Result<(), String> {
    conn.execute(
        "DELETE FROM workitem_repo_bindings WHERE workitem_id = ?1 AND repo_id = ?2",
        params![workitem_id, repo_id],
    )
    .map(|_| ())
    .map_err(|e| format!("删除分支模板绑定失败 ({workitem_id}#{repo_id}): {e}"))
}

/// save_workitem_repos 语义：`keep_repo_ids = None` → 清空该需求全部绑定；
/// `Some(ids)` → 仅保留 repo_id ∈ ids 的绑定（Some([]) 等价清空）
pub fn delete_workitem_bindings(
    conn: &Connection,
    workitem_id: &str,
    keep_repo_ids: Option<&[i64]>,
) -> Result<(), String> {
    let keep_empty = keep_repo_ids.map(|ids| ids.is_empty()).unwrap_or(true);
    let result = if keep_empty {
        conn.execute(
            "DELETE FROM workitem_repo_bindings WHERE workitem_id = ?1",
            params![workitem_id],
        )
    } else {
        let ids = keep_repo_ids.unwrap();
        let placeholders = vec!["?"; ids.len()].join(", ");
        let sql = format!(
            "DELETE FROM workitem_repo_bindings WHERE workitem_id = ?1 AND repo_id NOT IN ({placeholders})"
        );
        let mut values: Vec<&dyn rusqlite::ToSql> = vec![&workitem_id];
        values.extend(ids.iter().map(|id| id as &dyn rusqlite::ToSql));
        conn.execute(&sql, values.as_slice())
    };
    result
        .map(|_| ())
        .map_err(|e| format!("清理需求 {workitem_id} 的分支模板绑定失败: {e}"))
}

// ---------- 单元测试（临时库，无 AppHandle） ----------

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_conn(tag: &str) -> (Connection, PathBuf) {
        let unique_id = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("nervd_db_test_{tag}_{unique_id}"));
        std::fs::create_dir_all(&dir).unwrap();
        let conn = Connection::open(dir.join("test.db")).unwrap();
        init_conn(&conn).unwrap();
        (conn, dir)
    }

    fn track(id: &str, name: &str) -> BranchRuleTemplate {
        BranchRuleTemplate {
            id: id.to_string(),
            name: name.to_string(),
            source_branch: "master".to_string(),
            baseline_branch_pattern: format!("iteration/{{iteration}}/{id}"),
            workitem_branch_pattern: "feature/{identifier}".to_string(),
        }
    }

    fn sample_settings() -> Settings {
        let mut settings = Settings {
            organization_id: "org-1".to_string(),
            default_space_identifier: "space-1".to_string(),
            link_pattern: credentials::LEGACY_LINK_PATTERN.to_string(),
            watched_repos: vec![12, 13],
            branch_rule_templates: vec![track("site-a", "A 局点"), track("site-b", "B 局点")],
            ..Settings::default()
        };
        settings.workitem_repos.insert("REQ-1".to_string(), vec![12]);
        settings
            .workitem_repo_branch_templates
            .insert("REQ-1".to_string(), {
                let mut repos = HashMap::new();
                repos.insert(12_i64, "site-b".to_string());
                repos.insert(13_i64, "ghost-track".to_string()); // 指向不存在的轨道 → 应跳过
                repos
            });
        settings
    }

    #[test]
    fn init_creates_tables_and_enables_foreign_keys() {
        let (conn, dir) = temp_conn("init");
        for table in ["app_settings", "branch_tracks", "workitem_repo_bindings"] {
            let count: i64 = conn
                .query_row(
                    &format!(
                        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = '{table}'"
                    ),
                    [],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(count, 1, "表 {table} 应被创建");
        }
        let foreign_keys: i64 = conn
            .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
            .unwrap();
        assert_eq!(foreign_keys, 1);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn migrate_imports_renames_bak_and_upgrades_legacy_pattern() {
        let (mut conn, dir) = temp_conn("migrate");
        let settings_path = dir.join("settings.json");
        std::fs::write(&settings_path, serde_json::to_string(&sample_settings()).unwrap())
            .unwrap();

        migrate_if_needed_with(&mut conn, Some(settings_path.clone())).unwrap();

        assert!(!settings_path.exists(), "迁移成功后 settings.json 应被改名");
        assert!(dir.join("settings.json.bak").exists(), "应生成 .bak 备份");

        let loaded = load_settings(&conn).unwrap();
        assert_eq!(loaded.organization_id, "org-1");
        assert_eq!(loaded.default_space_identifier, "space-1");
        assert_eq!(
            loaded.link_pattern,
            credentials::DEFAULT_LINK_PATTERN,
            "旧默认正则应一次性升级"
        );
        assert_eq!(loaded.watched_repos, vec![12, 13]);
        assert_eq!(
            loaded
                .branch_rule_templates
                .iter()
                .map(|t| t.id.clone())
                .collect::<Vec<_>>(),
            vec!["site-a", "site-b"],
            "全局轨道按 sort_order 排序"
        );
        // ghost-track 不存在 → 跳过；site-b 正常入库
        assert_eq!(loaded.workitem_repo_branch_templates["REQ-1"][&12], "site-b");
        assert!(!loaded.workitem_repo_branch_templates["REQ-1"].contains_key(&13));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn migrate_rerun_is_idempotent_and_keeps_new_file() {
        let (mut conn, dir) = temp_conn("idempotent");
        let settings_path = dir.join("settings.json");
        std::fs::write(&settings_path, serde_json::to_string(&sample_settings()).unwrap())
            .unwrap();
        migrate_if_needed_with(&mut conn, Some(settings_path.clone())).unwrap();

        // 第二次迁移：即使 settings.json 再次出现也不得重复导入或改名
        std::fs::write(
            &settings_path,
            serde_json::to_string(&Settings::default()).unwrap(),
        )
        .unwrap();
        migrate_if_needed_with(&mut conn, Some(settings_path.clone())).unwrap();

        let loaded = load_settings(&conn).unwrap();
        assert_eq!(
            loaded.organization_id, "org-1",
            "schema_version 已存在，第二次迁移不得重复导入"
        );
        assert!(
            settings_path.exists(),
            "幂等重跑不应再次改名（未发生导入）"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn migrate_without_settings_file_stamps_schema_version() {
        let (mut conn, dir) = temp_conn("fresh");
        migrate_if_needed_with(&mut conn, None).unwrap();
        assert_eq!(
            get_app_setting(&conn, KEY_SCHEMA_VERSION).unwrap().as_deref(),
            Some("1")
        );
        let loaded = load_settings(&conn).unwrap();
        assert!(loaded.organization_id.is_empty());
        assert!(loaded.branch_rule_templates.is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn deleting_global_track_nulls_binding_and_falls_back_to_inherit() {
        let (mut conn, dir) = temp_conn("fk_set_null");
        replace_global_tracks(&mut conn, &[track("site-a", "A"), track("site-b", "B")]).unwrap();
        upsert_binding(&conn, "REQ-1", 12, Some("site-b")).unwrap();
        upsert_binding(&conn, "REQ-2", 13, Some("site-a")).unwrap();

        // 删除 site-b（新集合不再包含）
        replace_global_tracks(&mut conn, &[track("site-a", "A")]).unwrap();

        let track_id: Option<String> = conn
            .query_row(
                "SELECT track_id FROM workitem_repo_bindings WHERE workitem_id = 'REQ-1' AND repo_id = 12",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(track_id, None, "FK ON DELETE SET NULL 应把绑定置空");

        let loaded = load_settings(&conn).unwrap();
        assert!(
            !loaded.workitem_repo_branch_templates.contains_key("REQ-1"),
            "置空绑定在 Settings 中不呈现 = 回退继承"
        );
        assert_eq!(
            loaded.workitem_repo_branch_templates["REQ-2"][&13], "site-a",
            "保留轨道的绑定不受影响"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn replace_iteration_tracks_only_affects_target_iteration() {
        let (mut conn, dir) = temp_conn("iteration_scope");
        replace_iteration_tracks(&mut conn, "sprint-1", &[track("iter-a", "迭代 A")]).unwrap();
        replace_iteration_tracks(&mut conn, "sprint-2", &[track("iter-b", "迭代 B")]).unwrap();

        // sprint-1 换新轨道；同名轨道在不同迭代间允许
        replace_iteration_tracks(&mut conn, "sprint-1", &[track("iter-c", "迭代 B")]).unwrap();

        assert_eq!(
            iteration_tracks(&conn, "sprint-1")
                .unwrap()
                .iter()
                .map(|t| t.id.clone())
                .collect::<Vec<_>>(),
            vec!["iter-c"]
        );
        assert_eq!(
            iteration_tracks(&conn, "sprint-2")
                .unwrap()
                .iter()
                .map(|t| t.id.clone())
                .collect::<Vec<_>>(),
            vec!["iter-b"],
            "其他迭代的轨道不受影响"
        );
        // 迭代轨道不混入全局轨道
        assert!(global_tracks(&conn).unwrap().is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn plain_settings_roundtrip_and_local_storage_flag() {
        let (conn, dir) = temp_conn("roundtrip");
        let settings = sample_settings();
        upsert_plain_settings(&conn, &settings).unwrap();
        let reloaded = load_settings(&conn).unwrap();
        assert_eq!(reloaded.organization_id, "org-1");
        assert_eq!(reloaded.watched_repos, vec![12, 13]);
        assert_eq!(
            reloaded.workitem_repo_branch_templates,
            HashMap::new(),
            "轨道/绑定不走 app_settings"
        );

        assert!(!local_storage_imported(&conn).unwrap());
        upsert_app_setting(&conn, KEY_LOCAL_STORAGE_IMPORTED, "1").unwrap();
        assert!(local_storage_imported(&conn).unwrap());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn delete_workitem_bindings_keeps_only_requested_repos() {
        let (conn, dir) = temp_conn("bindings_prune");
        upsert_track(&conn, &track("site-a", "A 局点"), "global", None, 0).unwrap();
        upsert_binding(&conn, "REQ-1", 12, Some("site-a")).unwrap();
        upsert_binding(&conn, "REQ-1", 13, Some("site-a")).unwrap();
        upsert_binding(&conn, "REQ-2", 12, Some("site-a")).unwrap();

        // 仅保留 repo 13：REQ-1 的 repo 12 绑定被清理，REQ-2 不受影响
        delete_workitem_bindings(&conn, "REQ-1", Some(&[13])).unwrap();
        let req1_repos: Vec<i64> = {
            let mut stmt = conn
                .prepare("SELECT repo_id FROM workitem_repo_bindings WHERE workitem_id = 'REQ-1'")
                .unwrap();
            let rows = stmt.query_map([], |row| row.get::<_, i64>(0)).unwrap();
            let mut ids: Vec<i64> = rows.filter_map(Result::ok).collect();
            ids.sort_unstable();
            ids
        };
        assert_eq!(req1_repos, vec![13]);

        // Some([]) 等价清空；None 全清
        delete_workitem_bindings(&conn, "REQ-1", Some(&[])).unwrap();
        delete_workitem_bindings(&conn, "REQ-2", None).unwrap();
        let total: i64 = conn
            .query_row("SELECT COUNT(*) FROM workitem_repo_bindings", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(total, 0);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn corrupt_single_key_falls_back_to_default_and_keeps_other_keys() {
        let (conn, dir) = temp_conn("corrupt_key");
        upsert_app_setting(&conn, "organizationId", "\"org-ok\"").unwrap();
        upsert_app_setting(&conn, "watchedRepos", "[12,13]").unwrap();
        // 模拟单键 JSON 损坏（历史版本写坏 / 手工编辑）
        upsert_app_setting(&conn, "workitemRepos", "{not-valid-json").unwrap();
        upsert_app_setting(&conn, "repoCiBindings", "{\"12\":").unwrap();

        let loaded = load_settings(&conn).expect("单键损坏不得让 load_settings 失败");
        assert_eq!(loaded.organization_id, "org-ok");
        assert_eq!(loaded.watched_repos, vec![12, 13]);
        assert!(loaded.workitem_repos.is_empty(), "损坏键回退默认值");
        assert!(loaded.repo_ci_bindings.is_empty(), "损坏键回退默认值");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn settings_patch_writes_only_provided_keys() {
        let (conn, dir) = temp_conn("patch");
        upsert_plain_settings(&conn, &sample_settings()).unwrap();
        let patch: SettingsPatch =
            serde_json::from_str(r#"{"watchedRepos":[99],"allowWriteOps":true}"#).unwrap();
        upsert_settings_patch(&conn, &patch).unwrap();

        let loaded = load_settings(&conn).unwrap();
        assert_eq!(loaded.watched_repos, vec![99], "显式字段被写入");
        assert!(loaded.allow_write_ops, "显式字段被写入");
        assert_eq!(
            loaded.organization_id, "org-1",
            "未提供的字段保持库中原值"
        );
        assert_eq!(
            loaded.workitem_repos,
            sample_settings().workitem_repos,
            "未提供的哈希表保持库中原值（不会被覆盖为空）"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }
}
