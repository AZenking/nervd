//! 本地仓库：git 只读探测、本地提交读取、绑定存储、active workitem、
//! commit-msg 钩子与 `.git` 变更监听。
//!
//! 设计约束：
//! - 所有 git 调用都走 `std::process::Command` 的参数数组（不经 shell），
//!   路径含空格/中文也能正确处理；
//! - 只读命令带 15s 超时，避免异常仓库挂住 IPC；
//! - 本模块不依赖具体网络实现，工作项详情解析放在命令层；
//! - watcher 句柄由 `AppStateInner::local_watchers` 持有，drop 即停止。

use crate::attribution::model::{ActiveWorkitem, HookStatus, LocalRepoBinding, LocalRepoInfo};
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::Emitter;

/// 单次 git 只读命令的超时时间。正常命令毫秒级返回，此值只用于兜底。
const GIT_TIMEOUT: Duration = Duration::from_secs(15);
/// `read_local_commits` 单次最多返回的提交数。
const MAX_COMMITS: usize = 100;
/// git log 的自定义记录格式：记录分隔符 + SHA + 提交时间 + 作者 + 完整消息。
const LOG_FORMAT: &str = "%x1e%H%x1f%ct%x1f%an%x1f%B%x1f";
/// 写入钩子脚本的标记，用于识别「这个钩子是否由 nervd 管理」。
const HOOK_MARKER: &str = "nervd-managed: commit-msg";
/// watcher 防抖窗口。
const WATCH_DEBOUNCE: Duration = Duration::from_millis(500);

/// 本地 git 提交的精简表示，供 `attribution::sync` 写入事件索引。
#[derive(Debug, Clone)]
pub struct LocalCommit {
    pub sha: String,
    pub message: String,
    pub author: Option<String>,
    pub committed_at: i64,
    pub additions: u32,
    pub deletions: u32,
    pub files_changed: u32,
}

// ---------------------------------------------------------------------------
// 通用工具
// ---------------------------------------------------------------------------

/// 当前时间（epoch 毫秒），与前端 `committedAt` / `updatedAt` 的语义保持一致。
pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn truncate_text(text: &str, max: usize) -> String {
    if text.chars().count() <= max {
        return text.to_string();
    }
    let mut out: String = text.chars().take(max).collect();
    out.push('…');
    out
}

/// 校验并规范化仓库路径：必须存在且是目录；尽量 canonicalize 以消除
/// `/tmp` → `/private/tmp` 这类同义路径造成的绑定重复。
fn normalize_repo_path(path: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("本地仓库路径不能为空".into());
    }
    let raw = PathBuf::from(trimmed);
    if !raw.exists() {
        return Err(format!("本地仓库路径不存在: {trimmed}"));
    }
    if !raw.is_dir() {
        return Err(format!("本地仓库路径不是目录: {trimmed}"));
    }
    Ok(fs::canonicalize(&raw).unwrap_or(raw))
}

fn path_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

/// 执行 git（参数数组，不经 shell）。stdout 成功时返回；失败返回可读错误。
fn run_git(path: &str, args: &[&str]) -> Result<String, String> {
    run_git_with_timeout(path, args, GIT_TIMEOUT)
}

fn run_git_with_timeout(path: &str, args: &[&str], timeout: Duration) -> Result<String, String> {
    if path.trim().is_empty() {
        return Err("本地仓库路径不能为空".into());
    }
    let mut child = Command::new("git")
        .arg("-C")
        .arg(path)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("无法执行 git（请确认已安装 git）: {e}"))?;

    let mut stdout_pipe = child
        .stdout
        .take()
        .ok_or_else(|| "git stdout 不可用".to_string())?;
    let mut stderr_pipe = child
        .stderr
        .take()
        .ok_or_else(|| "git stderr 不可用".to_string())?;
    let stdout_reader = std::thread::spawn(move || {
        use std::io::Read;
        let mut buf = Vec::new();
        let _ = stdout_pipe.read_to_end(&mut buf);
        buf
    });
    let stderr_reader = std::thread::spawn(move || {
        use std::io::Read;
        let mut buf = Vec::new();
        let _ = stderr_pipe.read_to_end(&mut buf);
        buf
    });

    let deadline = Instant::now() + timeout;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) => {}
            Err(e) => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = stdout_reader.join();
                let _ = stderr_reader.join();
                return Err(format!("等待 git 进程失败: {e}"));
            }
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            break None;
        }
        std::thread::sleep(Duration::from_millis(10));
    };

    let stdout = stdout_reader.join().unwrap_or_default();
    let stderr = stderr_reader.join().unwrap_or_default();
    let stdout = String::from_utf8_lossy(&stdout).to_string();
    let stderr = String::from_utf8_lossy(&stderr).to_string();

    let Some(status) = status else {
        return Err(format!(
            "git {} 超时（>{}s）: {}",
            args.join(" "),
            timeout.as_secs(),
            truncate_text(stderr.trim(), 300)
        ));
    };
    if !status.success() {
        let detail = stderr.trim();
        return Err(if detail.is_empty() {
            format!(
                "git {} 执行失败（退出码 {:?}）",
                args.join(" "),
                status.code()
            )
        } else {
            format!(
                "git {} 执行失败: {}",
                args.join(" "),
                truncate_text(detail, 500)
            )
        });
    }
    Ok(stdout)
}

fn git_absolute_dir(repo_path: &str) -> Result<PathBuf, String> {
    if let Ok(out) = run_git(repo_path, &["rev-parse", "--absolute-git-dir"]) {
        let value = out.trim();
        if !value.is_empty() {
            return Ok(PathBuf::from(value));
        }
    }
    let out = run_git(repo_path, &["rev-parse", "--git-dir"])?;
    let raw = out.trim();
    if raw.is_empty() {
        return Err(format!("无法定位 {repo_path} 的 .git 目录"));
    }
    let path = PathBuf::from(raw);
    if path.is_absolute() {
        Ok(path)
    } else {
        let joined = Path::new(repo_path).join(path);
        Ok(fs::canonicalize(&joined).unwrap_or(joined))
    }
}

/// 工作树根目录（`.nervd/` 就放在这里）。
pub fn repo_root(repo_path: &str) -> Result<String, String> {
    let path = normalize_repo_path(repo_path)?;
    let value = path_string(&path);
    let out = run_git(&value, &["rev-parse", "--show-toplevel"])?;
    let root = out.trim();
    if root.is_empty() {
        return Err(format!("{value} 不在 Git 工作树内"));
    }
    Ok(root.to_string())
}

// ---------------------------------------------------------------------------
// 只读探测
// ---------------------------------------------------------------------------

/// 只读探测仓库：是否 git、origin 地址、当前分支、HEAD、是否 dirty。
///
/// 非 git 目录不返回 `Err`，而是 `is_git=false` + `error`，方便前端直接展示原因。
pub fn inspect_local_repo(path: &str) -> Result<LocalRepoInfo, String> {
    let normalized = normalize_repo_path(path)?;
    let repo = path_string(&normalized);

    let inside = run_git(&repo, &["rev-parse", "--is-inside-work-tree"]);
    let is_git = matches!(&inside, Ok(out) if out.trim() == "true");
    if !is_git {
        let detail = inside
            .err()
            .map(|e| truncate_text(&e, 300))
            .unwrap_or_else(|| "不在 Git 工作树内".to_string());
        return Ok(LocalRepoInfo {
            path: repo,
            is_git: false,
            remote_url: None,
            current_branch: None,
            head_sha: None,
            dirty: false,
            hook_installed: false,
            hook_mode: "off".into(),
            hook_path: None,
            error: Some(format!("不是 Git 仓库: {detail}")),
        });
    }

    let remote_url = run_git(&repo, &["remote", "get-url", "origin"])
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let current_branch = run_git(&repo, &["branch", "--show-current"])
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let head_sha = run_git(&repo, &["rev-parse", "HEAD"])
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let dirty = run_git(&repo, &["status", "--porcelain"])
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    let (hook_installed, hook_mode, hook_path) = inspect_commit_msg_hook(&repo);

    Ok(LocalRepoInfo {
        path: repo,
        is_git: true,
        remote_url,
        current_branch,
        head_sha,
        dirty,
        hook_installed,
        hook_mode,
        hook_path,
        error: None,
    })
}

/// 以钩子文件为准判断 nervd 钩子状态：存在且带 `HOOK_MARKER` 才算已安装，
/// 并解析脚本头部声明的 mode。避免数据库标记过期（例如仓库目录被重新绑定后）。
fn inspect_commit_msg_hook(repo: &str) -> (bool, String, Option<String>) {
    let Ok(path) = commit_msg_hook_path(repo) else {
        return (false, "off".into(), None);
    };
    let hook_path = path_string(&path);
    let text = fs::read_to_string(&path).unwrap_or_default();
    if !text.contains(HOOK_MARKER) {
        return (false, "off".into(), Some(hook_path));
    }
    let mode = text
        .lines()
        .find(|line| line.contains(HOOK_MARKER))
        .and_then(|line| line.split("(mode: ").nth(1))
        .and_then(|rest| rest.split(')').next())
        .map(str::trim)
        .unwrap_or("fill");
    let mode = normalize_hook_mode(Some(mode)).unwrap_or_else(|_| "fill".to_string());
    (true, mode, Some(hook_path))
}

/// 本地分支列表（`refs/heads`），按 git 默认字典序返回。供 `attribution::sync` 使用。
#[allow(dead_code)]
pub fn list_local_branches(path: &str) -> Result<Vec<String>, String> {
    let normalized = normalize_repo_path(path)?;
    let repo = path_string(&normalized);
    let out = run_git(
        &repo,
        &["for-each-ref", "--format=%(refname:short)", "refs/heads"],
    )?;
    Ok(out
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(ToString::to_string)
        .collect())
}

/// origin 的默认分支提示（detached HEAD 时用于绑定保存）。
pub fn origin_default_branch(path: &str) -> Option<String> {
    let normalized = normalize_repo_path(path).ok()?;
    let repo = path_string(&normalized);
    let out = run_git(
        &repo,
        &["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
    )
    .ok()?;
    let value = out.trim();
    let value = value.strip_prefix("origin/").unwrap_or(value);
    if value.is_empty() {
        None
    } else {
        Some(value.to_string())
    }
}

// ---------------------------------------------------------------------------
// 本地提交读取
// ---------------------------------------------------------------------------

fn parse_numstat_count(value: Option<&str>) -> u32 {
    value
        .and_then(|v| v.trim().parse::<u32>().ok())
        .unwrap_or(0)
}

fn parse_local_commits(output: &str) -> Vec<LocalCommit> {
    let mut commits = Vec::new();
    for chunk in output.split('\u{1e}') {
        if chunk.trim().is_empty() {
            continue;
        }
        // chunk = sha \x1f ct \x1f author \x1f message \x1f numstat...
        let mut head = chunk.splitn(4, '\u{1f}');
        let Some(raw_sha) = head.next() else { continue };
        let sha = raw_sha.trim();
        if sha.is_empty() {
            continue;
        }
        let committed_at = head
            .next()
            .and_then(|v| v.trim().parse::<i64>().ok())
            .unwrap_or(0)
            .saturating_mul(1000);
        let author = head
            .next()
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .map(ToString::to_string);
        let rest = head.next().unwrap_or("");
        let (raw_message, stats) = match rest.split_once('\u{1f}') {
            Some((message, stats)) => (message, stats),
            None => (rest, ""),
        };

        let mut additions = 0u32;
        let mut deletions = 0u32;
        let mut files_changed = 0u32;
        for line in stats.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            let mut columns = line.splitn(3, '\t');
            let add = columns.next();
            let del = columns.next();
            let file = columns.next();
            if add.is_none() || del.is_none() || file.is_none() {
                continue;
            }
            additions = additions.saturating_add(parse_numstat_count(add));
            deletions = deletions.saturating_add(parse_numstat_count(del));
            files_changed = files_changed.saturating_add(1);
        }

        commits.push(LocalCommit {
            sha: sha.to_string(),
            message: raw_message.trim().to_string(),
            author,
            committed_at,
            additions,
            deletions,
            files_changed,
        });
    }
    commits
}

/// 读取本地分支提交（`branch = None` 取当前 HEAD）。
///
/// `since` 为空时取最近 100 条；给出 `since` 时使用 `--since=<since>` 并仍限制 100 条。
/// merge commit 默认没有 numstat，统计记为 0，不会影响其余提交解析。
pub fn read_local_commits(
    path: &str,
    branch: Option<&str>,
    since: Option<&str>,
) -> Result<Vec<LocalCommit>, String> {
    let normalized = normalize_repo_path(path)?;
    let repo = path_string(&normalized);
    let rev = branch
        .map(str::trim)
        .filter(|b| !b.is_empty())
        .unwrap_or("HEAD");
    if rev.starts_with('-') {
        return Err(format!("非法分支名: {rev}"));
    }
    // 空仓库（尚无任何提交）不是错误：返回空列表即可。
    if rev == "HEAD" {
        match run_git(&repo, &["rev-parse", "--verify", "--quiet", "HEAD"]) {
            Ok(_) => {}
            Err(error) if error.contains("无法执行 git") => return Err(error),
            Err(_) => return Ok(Vec::new()),
        }
    }

    let mut args: Vec<String> = vec![
        "log".to_string(),
        rev.to_string(),
        format!("--format={LOG_FORMAT}"),
        "--numstat".to_string(),
        "-n".to_string(),
        MAX_COMMITS.to_string(),
    ];
    if let Some(since) = since.map(str::trim).filter(|s| !s.is_empty()) {
        args.push(format!("--since={since}"));
    }
    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let output = run_git(&repo, &arg_refs)?;
    Ok(parse_local_commits(&output))
}

// ---------------------------------------------------------------------------
// repo_local_bindings 持久化
// ---------------------------------------------------------------------------

const BINDING_SELECT: &str = "SELECT repo_id, path, remote_url, default_branch, hook_installed, hook_mode, updated_at FROM repo_local_bindings";

fn map_binding(row: &Row<'_>) -> rusqlite::Result<LocalRepoBinding> {
    Ok(LocalRepoBinding {
        repo_id: row.get(0)?,
        path: row.get(1)?,
        remote_url: row.get(2)?,
        default_branch: row.get(3)?,
        hook_installed: row.get::<_, i64>(4)? != 0,
        hook_mode: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

fn map_binding_error(error: rusqlite::Error) -> String {
    let text = error.to_string();
    if text.contains("UNIQUE constraint failed: repo_local_bindings.path") {
        "该本地路径已绑定到其他仓库，请先解绑后再保存".into()
    } else {
        format!("读写本地仓库绑定失败: {text}")
    }
}

pub fn list_local_repo_bindings(conn: &Connection) -> Result<Vec<LocalRepoBinding>, String> {
    let sql = format!("{BINDING_SELECT} ORDER BY updated_at DESC, repo_id ASC");
    let mut stmt = conn.prepare(&sql).map_err(map_binding_error)?;
    let rows = stmt.query_map([], map_binding).map_err(map_binding_error)?;
    let mut bindings = Vec::new();
    for row in rows {
        bindings.push(row.map_err(map_binding_error)?);
    }
    Ok(bindings)
}

pub fn get_local_repo_binding(
    conn: &Connection,
    repo_id: i64,
) -> Result<Option<LocalRepoBinding>, String> {
    conn.query_row(
        &format!("{BINDING_SELECT} WHERE repo_id = ?1"),
        params![repo_id],
        map_binding,
    )
    .optional()
    .map_err(map_binding_error)
}

/// 插入/更新绑定。`repo_id` 是主键；`path` 唯一。
///
/// 同路径更新保留钩子状态；路径变化时清空（旧目录的钩子不跟随新目录）。
pub fn upsert_local_repo_binding(
    conn: &Connection,
    repo_id: i64,
    path: &str,
    remote_url: Option<&str>,
    default_branch: Option<&str>,
    updated_at: i64,
) -> Result<LocalRepoBinding, String> {
    if repo_id <= 0 {
        return Err("repo_id 必须大于 0".into());
    }
    let path = path.trim();
    if path.is_empty() {
        return Err("本地仓库路径不能为空".into());
    }
    let conflict: Option<i64> = conn
        .query_row(
            "SELECT repo_id FROM repo_local_bindings WHERE path = ?1",
            params![path],
            |row| row.get(0),
        )
        .optional()
        .map_err(map_binding_error)?;
    if let Some(other) = conflict {
        if other != repo_id {
            return Err(format!("该本地路径已绑定到仓库 {other}，请先解绑后再保存"));
        }
    }

    conn.execute(
        "INSERT INTO repo_local_bindings
            (repo_id, path, remote_url, default_branch, hook_installed, hook_mode, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 0, 'fill', ?5, ?5)
         ON CONFLICT(repo_id) DO UPDATE SET
            path = excluded.path,
            remote_url = excluded.remote_url,
            default_branch = excluded.default_branch,
            -- 目录变更后旧钩子仍留在旧路径：清空状态，强制在新目录重新核对/安装
            hook_installed = CASE
                WHEN repo_local_bindings.path = excluded.path THEN repo_local_bindings.hook_installed
                ELSE 0
            END,
            hook_mode = CASE
                WHEN repo_local_bindings.path = excluded.path THEN repo_local_bindings.hook_mode
                ELSE 'fill'
            END,
            updated_at = excluded.updated_at",
        params![repo_id, path, remote_url, default_branch, updated_at],
    )
    .map_err(|e| {
        let text = e.to_string();
        if text.contains("UNIQUE constraint failed: repo_local_bindings.path") {
            "该本地路径已绑定到其他仓库，请先解绑后再保存".to_string()
        } else {
            format!("保存本地仓库绑定失败: {text}")
        }
    })?;

    get_local_repo_binding(conn, repo_id)?
        .ok_or_else(|| "保存本地仓库绑定后未能读回记录".to_string())
}

pub fn delete_local_repo_binding(conn: &Connection, repo_id: i64) -> Result<bool, String> {
    if repo_id <= 0 {
        return Err("repo_id 必须大于 0".into());
    }
    let affected = conn
        .execute(
            "DELETE FROM repo_local_bindings WHERE repo_id = ?1",
            params![repo_id],
        )
        .map_err(map_binding_error)?;
    Ok(affected > 0)
}

pub fn set_local_repo_hook_state(
    conn: &Connection,
    repo_id: i64,
    installed: bool,
    mode: &str,
    updated_at: i64,
) -> Result<(), String> {
    conn.execute(
        "UPDATE repo_local_bindings
            SET hook_installed = ?2, hook_mode = ?3, updated_at = ?4
          WHERE repo_id = ?1",
        params![repo_id, if installed { 1 } else { 0 }, mode, updated_at],
    )
    .map_err(map_binding_error)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// active workitem（`.nervd/active-workitem.json`）
// ---------------------------------------------------------------------------

fn value_str(value: &Value, keys: &[&str]) -> Option<String> {
    for key in keys {
        let Some(raw) = value.get(*key) else { continue };
        let text = raw
            .as_str()
            .map(ToString::to_string)
            .or_else(|| raw.as_i64().map(|n| n.to_string()));
        if let Some(text) = text {
            let text = text.trim();
            if !text.is_empty() {
                return Some(text.to_string());
            }
        }
    }
    None
}

pub fn normalize_category(raw: &str) -> String {
    match raw.trim().to_ascii_lowercase().as_str() {
        "" => "Req".into(),
        "req" | "requirement" | "需求" => "Req".into(),
        "bug" | "defect" | "缺陷" => "Bug".into(),
        "task" | "任务" => "Task".into(),
        _ => raw.trim().to_string(),
    }
}

fn is_category_token(raw: &str) -> bool {
    matches!(
        raw.trim().to_ascii_lowercase().as_str(),
        "req" | "requirement" | "bug" | "defect" | "task" | "需求" | "缺陷" | "任务"
    )
}

fn file_mtime_ms(path: &Path) -> Option<i64> {
    fs::metadata(path)
        .ok()?
        .modified()
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|d| d.as_millis() as i64)
}

fn parse_active_json(
    text: &str,
    repo_id: i64,
    fallback_updated_at: i64,
) -> Result<ActiveWorkitem, String> {
    let value: Value =
        serde_json::from_str(text).map_err(|e| format!("active-workitem.json 解析失败: {e}"))?;
    if !value.is_object() {
        return Err("active-workitem.json 顶层必须是对象".into());
    }
    let identifier = value_str(
        &value,
        &["identifier", "workitemIdentifier", "serialNumber"],
    )
    .ok_or_else(|| "active-workitem.json 缺少 identifier".to_string())?;
    let workitem_id = value_str(&value, &["workitemId", "workitem_id", "id"])
        .unwrap_or_else(|| identifier.clone());
    let category = normalize_category_hint(
        &value_str(&value, &["category", "categoryId"]).unwrap_or_else(|| "Req".into()),
        &identifier,
    );
    let parent_workitem_id = value_str(
        &value,
        &["parentWorkitemId", "parent_workitem_id", "parentId"],
    );
    let parent_identifier = value_str(
        &value,
        &["parentIdentifier", "parent_identifier", "parentReq"],
    );
    let updated_at = value
        .get("updatedAt")
        .and_then(Value::as_i64)
        .filter(|v| *v > 0)
        .unwrap_or(fallback_updated_at);

    Ok(ActiveWorkitem {
        repo_id,
        workitem_id,
        identifier,
        category,
        parent_workitem_id,
        parent_identifier,
        updated_at,
    })
}

/// 兼容旧版 `<git-dir>/nervd-active-workitem` 纯文本（4 行）。
///
/// 约定顺序：identifier / workitem_id / category / parent_identifier；
/// 同时容忍 category 在第 2 行的旧格式。
pub fn category_from_identifier(identifier: &str) -> String {
    let upper = identifier.trim().to_ascii_uppercase();
    if upper.starts_with("TASK") {
        "Task".to_string()
    } else if upper.starts_with("BUG") {
        "Bug".to_string()
    } else {
        "Req".to_string()
    }
}

/// 归一化类别；云效有时返回 UUID 形式的 categoryId，此时按编号前缀推断。
pub fn normalize_category_hint(raw: &str, identifier: &str) -> String {
    let category = normalize_category(raw);
    if matches!(category.as_str(), "Req" | "Bug" | "Task") {
        category
    } else {
        category_from_identifier(identifier)
    }
}

fn parse_legacy_active(
    text: &str,
    repo_id: i64,
    updated_at: i64,
) -> Result<ActiveWorkitem, String> {
    let lines: Vec<&str> = text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect();
    if lines.is_empty() {
        return Err("旧版 nervd-active-workitem 文件为空".into());
    }

    // 文档契约（docs/agent-commit.md §3.2）：
    //   identifier / workitem_id / parent_identifier / parent_workitem_id
    // 同时容忍历史上带 category 的写法：
    //   identifier / workitem_id / category / parent_identifier
    //   identifier / category / workitem_id / parent_identifier
    let category_index = lines
        .iter()
        .take(3)
        .position(|line| is_category_token(line));
    let (identifier, workitem_id, category, parent_identifier, parent_workitem_id) =
        match category_index {
            Some(2) => (
                lines[0].to_string(),
                lines[1].to_string(),
                lines[2].to_string(),
                lines.get(3).map(|s| s.to_string()),
                lines.get(4).map(|s| s.to_string()),
            ),
            Some(1) => (
                lines[0].to_string(),
                lines.get(2).unwrap_or(&lines[0]).to_string(),
                lines[1].to_string(),
                lines.get(3).map(|s| s.to_string()),
                lines.get(4).map(|s| s.to_string()),
            ),
            Some(0) => (
                lines.get(1).unwrap_or(&lines[0]).to_string(),
                lines.get(2).unwrap_or(&lines[0]).to_string(),
                lines[0].to_string(),
                lines.get(3).map(|s| s.to_string()),
                lines.get(4).map(|s| s.to_string()),
            ),
            _ => (
                lines[0].to_string(),
                lines.get(1).unwrap_or(&lines[0]).to_string(),
                category_from_identifier(lines[0]),
                lines.get(2).map(|s| s.to_string()),
                lines.get(3).map(|s| s.to_string()),
            ),
        };

    Ok(ActiveWorkitem {
        repo_id,
        workitem_id: if workitem_id.trim().is_empty() {
            identifier.clone()
        } else {
            workitem_id
        },
        identifier,
        category: normalize_category(&category),
        parent_workitem_id: parent_workitem_id.filter(|s| !s.trim().is_empty()),
        parent_identifier: parent_identifier.filter(|s| !s.trim().is_empty()),
        updated_at,
    })
}

/// 不持有数据库锁的读取入口：先按绑定取出 `repo_id/path`，再读文件。
pub fn read_active_workitem_at(
    repo_id: i64,
    repo_path: &str,
) -> Result<Option<ActiveWorkitem>, String> {
    let normalized = normalize_repo_path(repo_path)?;
    let repo = path_string(&normalized);
    let root = repo_root(&repo).unwrap_or_else(|_| repo.clone());
    let json_path = Path::new(&root).join(".nervd").join("active-workitem.json");
    if json_path.is_file() {
        let text = fs::read_to_string(&json_path)
            .map_err(|e| format!("读取 {} 失败: {e}", json_path.display()))?;
        let updated_at = file_mtime_ms(&json_path).unwrap_or_else(now_ms);
        return parse_active_json(&text, repo_id, updated_at).map(Some);
    }

    if let Ok(git_dir) = git_absolute_dir(&repo) {
        let legacy = git_dir.join("nervd-active-workitem");
        if legacy.is_file() {
            let text = fs::read_to_string(&legacy)
                .map_err(|e| format!("读取 {} 失败: {e}", legacy.display()))?;
            let updated_at = file_mtime_ms(&legacy).unwrap_or_else(now_ms);
            return parse_legacy_active(&text, repo_id, updated_at).map(Some);
        }
    }
    Ok(None)
}

fn atomic_write(path: &Path, content: &str) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("无法定位 {} 的父目录", path.display()))?;
    fs::create_dir_all(parent).map_err(|e| format!("创建目录 {} 失败: {e}", parent.display()))?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("tmp");
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let tmp = parent.join(format!(".{file_name}.tmp-{}-{nanos}", std::process::id()));
    fs::write(&tmp, content).map_err(|e| format!("写入临时文件 {} 失败: {e}", tmp.display()))?;
    if let Err(e) = fs::rename(&tmp, path) {
        let _ = fs::remove_file(&tmp);
        return Err(format!("原子写入 {} 失败: {e}", path.display()));
    }
    Ok(())
}

/// 原子写入 `<repo-root>/.nervd/active-workitem.json`（临时文件 + rename）。
pub fn write_active_workitem(repo_path: &str, workitem: &ActiveWorkitem) -> Result<(), String> {
    let root = repo_root(repo_path)?;
    let directory = Path::new(&root).join(".nervd");
    fs::create_dir_all(&directory)
        .map_err(|e| format!("创建 {} 失败: {e}", directory.display()))?;
    let path = directory.join("active-workitem.json");
    let mut text = serde_json::to_string_pretty(workitem)
        .map_err(|e| format!("序列化 active workitem 失败: {e}"))?;
    text.push('\n');
    atomic_write(&path, &text)
}

/// 清除当前工作项（同时清理旧版文本，避免回退读取到过期上下文）。
pub fn clear_active_workitem(repo_path: &str) -> Result<(), String> {
    let root = repo_root(repo_path)?;
    let json_path = Path::new(&root).join(".nervd").join("active-workitem.json");
    if json_path.exists() {
        fs::remove_file(&json_path)
            .map_err(|e| format!("删除 {} 失败: {e}", json_path.display()))?;
    }
    if let Ok(git_dir) = git_absolute_dir(repo_path) {
        let legacy = git_dir.join("nervd-active-workitem");
        if legacy.exists() {
            let _ = fs::remove_file(&legacy);
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Agent 脚手架（开始处理时生成到绑定仓库的 .nervd 目录）
// ---------------------------------------------------------------------------

// 内嵌随二进制分发的脚本副本：保证工程内脚本与当前 nervd 版本一致。
const AGENT_SCRIPT_LIB: &str = include_str!("../../scripts/lib-attribution.sh");
const AGENT_SCRIPT_COMMIT: &str = include_str!("../../scripts/agent-commit.sh");
const AGENT_SCRIPT_READ_ACTIVE: &str = include_str!("../../scripts/read-active-workitem.sh");
const AGENT_SCRIPT_CHECK_ATTRIBUTION: &str = include_str!("../../scripts/check-commit-attribution.sh");

fn format_local_time(timestamp: i64) -> String {
    match chrono::DateTime::from_timestamp(timestamp, 0) {
        Some(datetime) => datetime
            .with_timezone(&chrono::Local)
            .format("%Y-%m-%d %H:%M:%S")
            .to_string(),
        None => timestamp.to_string(),
    }
}

/// 渲染 `.nervd/agent-task.md`：任务上下文快照 + 推荐命令 + 归属规则。
fn render_agent_task_markdown(
    workitem: &ActiveWorkitem,
    subject: Option<&str>,
    info: Option<&LocalRepoInfo>,
) -> String {
    let parent_line = match (&workitem.parent_identifier, &workitem.parent_workitem_id) {
        (Some(identifier), Some(id)) => format!("{identifier}（{id}）"),
        (Some(identifier), None) => identifier.clone(),
        (None, Some(id)) => id.clone(),
        (None, None) => "—".to_string(),
    };
    let commit_args = match &workitem.parent_identifier {
        Some(parent) => format!("--workitem {} --req {}", workitem.identifier, parent),
        None => format!("--workitem {}", workitem.identifier),
    };
    let branch_line = info
        .and_then(|value| value.current_branch.clone())
        .unwrap_or_else(|| "（游离 HEAD 或无法读取）".to_string());
    let head_line = info
        .and_then(|value| value.head_sha.clone())
        .map(|sha| sha.chars().take(12).collect::<String>())
        .unwrap_or_else(|| "—".to_string());
    let dirty_line = match info {
        Some(value) if value.dirty => "有未提交修改",
        Some(_) => "干净",
        None => "无法读取",
    };
    let remote_line = info
        .and_then(|value| value.remote_url.clone())
        .unwrap_or_else(|| "—".to_string());
    let task_line = subject
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("（未取得工作项标题，请以云效工作项编号为准）");
    let generated_at = format_local_time(workitem.updated_at);

    format!(
        r#"# Agent 任务说明 · {identifier}

> 由 nervd 在「开始处理」时自动生成并覆盖（{generated_at}）。仅本机使用，`.nervd/` 已被局部 .gitignore 忽略，请勿提交。

## 任务

- {task_line}

## 当前工作项

| 字段 | 值 |
| --- | --- |
| 编号 | {identifier} |
| 内部 ID | {workitem_id} |
| 类别 | {category} |
| 父需求 | {parent_line} |
| 仓库本地路径 | {repo_path} |
| 云效 repoId | {repo_id} |
| 本地分支 | {branch_line} |
| HEAD | {head_line} |
| 工作区 | {dirty_line} |
| 远程地址 | {remote_line} |

## 推荐命令（在仓库根目录执行）

```bash
./.nervd/scripts/read-active-workitem.sh
./.nervd/scripts/agent-commit.sh {commit_args} -m "<type>(<scope>): <subject>"
./.nervd/scripts/check-commit-attribution.sh origin/master...HEAD
```

## 归属规则

- 提交标题必须符合 Conventional Commits；每个 commit 必须带行首 `Refs: {identifier}`。
- 默认分支不是 master 时，把校验命令里的 `origin/master` 换成 `origin/<默认分支>`。
- commit-msg 钩子：`fill` 自动补全，`enforce` 拒绝缺少归属的提交；不要使用 `git commit --no-verify`。
- `.nervd/` 为本地状态，不要提交；本文件与 scripts/ 每次「开始处理」都会重新生成。
- 构建事件暂未接入：流水线 / Jenkins 构建结果不会自动归属或回写。
"#,
        identifier = workitem.identifier,
        workitem_id = workitem.workitem_id,
        category = workitem.category,
        parent_line = parent_line,
        repo_path = info.map(|value| value.path.as_str()).unwrap_or("—"),
        repo_id = workitem.repo_id,
        branch_line = branch_line,
        head_line = head_line,
        dirty_line = dirty_line,
        remote_line = remote_line,
        task_line = task_line,
        commit_args = commit_args,
        generated_at = generated_at,
    )
}

#[cfg(unix)]
fn make_script_executable(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    let permissions = fs::metadata(path)
        .map_err(|e| format!("读取 {} 权限失败: {e}", path.display()))?
        .permissions();
    let mut permissions = permissions;
    permissions.set_mode(0o755);
    fs::set_permissions(path, permissions)
        .map_err(|e| format!("设置 {} 可执行权限失败: {e}", path.display()))
}

#[cfg(not(unix))]
fn make_script_executable(_path: &Path) -> Result<(), String> {
    Ok(())
}

/// 生成 `<repo-root>/.nervd/agent-task.md`、`.nervd/scripts/*` 与局部 `.nervd/.gitignore`。
///
/// 供「开始处理」在写入 active-workitem 后调用；调用方按「尽力而为」处理错误，不阻断主流程。
pub fn write_agent_scaffold(
    repo_path: &str,
    workitem: &ActiveWorkitem,
    subject: Option<&str>,
) -> Result<(), String> {
    let root = repo_root(repo_path)?;
    let nervd_dir = Path::new(&root).join(".nervd");
    let scripts_dir = nervd_dir.join("scripts");
    fs::create_dir_all(&scripts_dir)
        .map_err(|e| format!("创建 {} 失败: {e}", scripts_dir.display()))?;

    // 只忽略 .nervd 目录自身，避免污染业务仓库，也不改动项目根 .gitignore。
    atomic_write(&nervd_dir.join(".gitignore"), "*\n")?;

    let scripts = [
        ("lib-attribution.sh", AGENT_SCRIPT_LIB),
        ("agent-commit.sh", AGENT_SCRIPT_COMMIT),
        ("read-active-workitem.sh", AGENT_SCRIPT_READ_ACTIVE),
        ("check-commit-attribution.sh", AGENT_SCRIPT_CHECK_ATTRIBUTION),
    ];
    for (name, content) in scripts {
        let path = scripts_dir.join(name);
        atomic_write(&path, content)?;
        make_script_executable(&path)?;
    }

    let info = inspect_local_repo(&root).ok();
    let markdown = render_agent_task_markdown(workitem, subject, info.as_ref());
    atomic_write(&nervd_dir.join("agent-task.md"), &markdown)?;
    Ok(())
}

/// 从 `workitem_identifiers` 缓存恢复工作项上下文（网络不可用时兜底）。
#[allow(clippy::type_complexity)]
pub fn cached_workitem_context(
    conn: &Connection,
    repo_id: i64,
    key: &str,
) -> Result<Option<ActiveWorkitem>, String> {
    let key = key.trim();
    if key.is_empty() {
        return Ok(None);
    }
    let row: Option<(
        String,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
    )> = conn
        .query_row(
            "SELECT identifier, workitem_id, category, parent_workitem_id, parent_identifier
               FROM workitem_identifiers
              WHERE (workitem_id = ?1 OR identifier = ?1) AND error IS NULL
              LIMIT 1",
            params![key],
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
        .optional()
        .map_err(|e| format!("读取工作项缓存失败: {e}"))?;

    let Some((identifier, workitem_id, category, parent_workitem_id, parent_identifier)) = row
    else {
        return Ok(None);
    };
    if identifier.trim().is_empty() {
        return Ok(None);
    }
    Ok(Some(ActiveWorkitem {
        repo_id,
        workitem_id: workitem_id
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| key.to_string()),
        identifier,
        category: normalize_category(category.as_deref().unwrap_or("Req")),
        parent_workitem_id,
        parent_identifier,
        updated_at: now_ms(),
    }))
}

// ---------------------------------------------------------------------------
// commit-msg 钩子
// ---------------------------------------------------------------------------

pub fn normalize_hook_mode(mode: Option<&str>) -> Result<String, String> {
    let mode = mode.unwrap_or("").trim().to_ascii_lowercase();
    if mode.is_empty() {
        return Ok("fill".into());
    }
    match mode.as_str() {
        "fill" | "enforce" | "off" => Ok(mode),
        other => Err(format!(
            "无效的钩子模式 \"{other}\"（支持 fill / enforce / off）"
        )),
    }
}

/// `git rev-parse --git-path hooks/commit-msg`：兼容 worktree 与 `core.hooksPath`。
pub fn commit_msg_hook_path(repo_path: &str) -> Result<PathBuf, String> {
    let normalized = normalize_repo_path(repo_path)?;
    let repo = path_string(&normalized);
    let out = run_git(&repo, &["rev-parse", "--git-path", "hooks/commit-msg"])?;
    let raw = out.trim();
    if raw.is_empty() {
        return Err(format!("无法解析 {repo} 的 commit-msg 钩子路径"));
    }
    let path = PathBuf::from(raw);
    Ok(if path.is_absolute() {
        path
    } else {
        Path::new(&repo).join(path)
    })
}

fn hook_script(mode: &str) -> String {
    if mode == "off" {
        return format!(
            "#!/bin/sh\n# {HOOK_MARKER} (mode: off)\n# nervd 钩子已安装但未启用。\nexit 0\n"
        );
    }

    let no_context = if mode == "enforce" {
        r#"  echo "nervd: 无法确定工作项，commit 已被 commit-msg 钩子拒绝（enforce 模式）。" >&2
  echo "请在提交信息末尾补充：" >&2
  echo "  Refs: REQ-123" >&2
  echo "  Req: REQ-100" >&2
  echo "临时跳过：Nervd-Skip: true" >&2
  exit 1"#
    } else {
        "  exit 0"
    };

    format!(
        r#"#!/bin/sh
# {HOOK_MARKER} (mode: {mode})
# 由 nervd 安装；下次安装会覆盖本文件。不要在此脚本里做联网或重活。

MSG_FILE="$1"
[ -n "$MSG_FILE" ] || exit 0
[ -f "$MSG_FILE" ] || exit 0

if grep -q '^Nervd-Skip:' "$MSG_FILE" 2>/dev/null; then exit 0; fi
if grep -q '^Refs:' "$MSG_FILE" 2>/dev/null; then exit 0; fi

INFO="$(git rev-parse --git-dir --show-toplevel 2>/dev/null)"
GIT_DIR="$(printf '%s\n' "$INFO" | sed -n '1p')"
ROOT="$(printf '%s\n' "$INFO" | sed -n '2p')"

if [ -n "$GIT_DIR" ] && [ -f "$GIT_DIR/MERGE_HEAD" ]; then exit 0; fi
SUBJECT="$(sed -n '1p' "$MSG_FILE")"
case "$SUBJECT" in
  Merge\ * | Revert\ *) ;;
  *)
    if ! printf '%s\n' "$SUBJECT" | grep -Eq '^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([A-Za-z0-9._/-]+\))?!?: .+'; then
      echo "nervd: 提交标题不符合 Conventional Commits 规范：$SUBJECT" >&2
      echo "  示例：feat(cashier): 接入易宝支付并支持结果查询" >&2
      if [ "{mode}" = "enforce" ]; then
        echo "  当前钩子为 enforce 模式，已拒绝提交。" >&2
        exit 1
      fi
      echo "  当前钩子为 {mode} 模式，仅警告；建议切换为 enforce 或使用 agent-commit.sh。" >&2
    fi
    ;;
esac

ID=""
PARENT=""
if [ -n "$ROOT" ] && [ -f "$ROOT/.nervd/active-workitem.json" ]; then
  ID="$(sed -n 's/.*"identifier"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$ROOT/.nervd/active-workitem.json" | sed -n '1p')"
  PARENT="$(sed -n 's/.*"parentIdentifier"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$ROOT/.nervd/active-workitem.json" | sed -n '1p')"
fi

if [ -z "$ID" ]; then
  BRANCH="$(git symbolic-ref --short -q HEAD 2>/dev/null)"
  [ -n "$BRANCH" ] || BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
  ID="$(printf '%s\n' "$BRANCH" | grep -oE '[A-Za-z][A-Za-z0-9]{{1,15}}[-_][0-9]+' | tail -n 1 | tr '[:lower:]' '[:upper:]')"
fi

if [ -z "$ID" ]; then
{no_context}
fi

if [ -n "$PARENT" ] && [ "$PARENT" != "$ID" ]; then
  printf '\n\nRefs: %s\nReq: %s\n' "$ID" "$PARENT" >> "$MSG_FILE"
else
  printf '\n\nRefs: %s\n' "$ID" >> "$MSG_FILE"
fi
exit 0
"#
    )
}

fn set_executable(path: &Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o755))
            .map_err(|e| format!("设置钩子可执行权限失败 ({}): {e}", path.display()))?;
    }
    #[cfg(not(unix))]
    {
        let _ = path;
    }
    Ok(())
}

fn backup_existing_hook(hook_path: &Path) -> Result<Option<PathBuf>, String> {
    if !hook_path.exists() {
        return Ok(None);
    }
    if hook_path.is_dir() {
        return Err(format!(
            "{} 是目录，无法作为 commit-msg 钩子",
            hook_path.display()
        ));
    }
    let existing = fs::read_to_string(hook_path).unwrap_or_default();
    if existing.contains(HOOK_MARKER) {
        return Ok(None);
    }
    let backup = PathBuf::from(format!("{}.nervd.bak", path_string(hook_path)));
    if backup.exists() {
        // 保留最近一次安装前的用户钩子，避免旧备份把新备份挤掉后无法恢复。
        fs::remove_file(&backup)
            .map_err(|e| format!("移除旧备份 {} 失败: {e}", backup.display()))?;
    }
    fs::rename(hook_path, &backup)
        .map_err(|e| format!("备份已有钩子到 {} 失败: {e}", backup.display()))?;
    Ok(Some(backup))
}

/// 安装 commit-msg 钩子。默认 `fill`（缺 Refs 自动补，不阻断）。
pub fn install_commit_msg_hook(repo_path: &str, mode: &str) -> Result<HookStatus, String> {
    let mode = normalize_hook_mode(Some(mode))?;
    let hook_path = commit_msg_hook_path(repo_path)?;
    let backup_path = backup_existing_hook(&hook_path)?;
    if let Some(parent) = hook_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("创建钩子目录 {} 失败: {e}", parent.display()))?;
    }
    atomic_write(&hook_path, &hook_script(&mode))?;
    set_executable(&hook_path)?;
    Ok(HookStatus {
        installed: true,
        mode,
        path: Some(path_string(&hook_path)),
        backup_path: backup_path.map(|path| path_string(&path)),
    })
}

/// 卸载钩子：有备份则恢复用户原钩子，否则删除 nervd 钩子。
pub fn uninstall_commit_msg_hook(repo_path: &str) -> Result<HookStatus, String> {
    let hook_path = commit_msg_hook_path(repo_path)?;
    let backup = PathBuf::from(format!("{}.nervd.bak", path_string(&hook_path)));
    if backup.is_file() {
        if hook_path.exists() {
            let _ = fs::remove_file(&hook_path);
        }
        fs::rename(&backup, &hook_path)
            .map_err(|e| format!("恢复钩子备份 {} 失败: {e}", backup.display()))?;
    } else if hook_path.is_file() {
        let existing = fs::read_to_string(&hook_path).unwrap_or_default();
        if existing.contains(HOOK_MARKER) {
            fs::remove_file(&hook_path)
                .map_err(|e| format!("删除钩子 {} 失败: {e}", hook_path.display()))?;
        }
        // 非 nervd 钩子：宁可保留用户脚本，也不擅自删除。
    }
    Ok(HookStatus {
        installed: false,
        mode: "off".into(),
        path: Some(path_string(&hook_path)),
        backup_path: None,
    })
}

// ---------------------------------------------------------------------------
// AI 拆解：读取现有代码上下文（只读）
// ---------------------------------------------------------------------------

/// 只纳入文本类代码文件，避免把图片/二进制/依赖产物塞进 Prompt。
fn is_code_path(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    if lower.contains("/dist/")
        || lower.contains("/node_modules/")
        || lower.contains("/.git/")
        || lower.contains("/coverage/")
        || lower.ends_with(".min.js")
        || lower.ends_with(".map")
        || lower.ends_with("lock.json")
        || lower.ends_with("package-lock.json")
        || lower.ends_with("pnpm-lock.yaml")
    {
        return false;
    }
    const EXTS: &[&str] = &[
        "ts", "tsx", "js", "jsx", "vue", "css", "scss", "less", "sass", "json", "md",
        "java", "kt", "py", "go", "rs", "sql", "yml", "yaml", "xml", "html", "sh",
        "c", "h", "cpp", "swift", "m", "mm", "php", "rb",
    ];
    path.rsplit_once('.').map(|(_, ext)| EXTS.contains(&ext.to_ascii_lowercase().as_str())).unwrap_or(false)
}

fn sanitize_repo_rel_path(path: &str) -> Option<String> {
    let trimmed = path.trim().trim_start_matches("./");
    if trimmed.is_empty() || trimmed.starts_with('/') || trimmed.contains("..") {
        return None;
    }
    Some(trimmed.to_string())
}

fn grep_code_paths(repo: &str, git_ref: &str, keywords: &[String]) -> Vec<String> {
    let mut args: Vec<String> = vec![
        "grep".into(),
        "-l".into(),
        "-F".into(),
        "-i".into(),
    ];
    for keyword in keywords
        .iter()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .take(20)
    {
        args.push("-e".into());
        args.push(keyword.to_string());
    }
    args.push(git_ref.to_string());
    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let Ok(output) = run_git(repo, &arg_refs) else {
        return Vec::new();
    };
    let prefix = format!("{git_ref}:");
    output
        .lines()
        .filter_map(|line| line.strip_prefix(&prefix))
        .map(str::trim)
        .filter(|path| is_code_path(path))
        .take(6)
        .map(str::to_string)
        .collect()
}

/// 读取本地仓库现有代码上下文：文件树（节选）+ 相关文件内容（截断）。
///
/// `paths` 优先（通常是本次改动的文件）；为空时按 `keywords` 在代码内容里搜索；
/// 两者都没有命中时只返回文件树，绝不整仓读取。
pub fn read_repo_code_context(
    repo_path: &str,
    ref_name: Option<&str>,
    paths: &[String],
    keywords: &[String],
) -> Result<Value, String> {
    let normalized = normalize_repo_path(repo_path)?;
    let repo = path_string(&normalized);

    let requested = ref_name.map(str::trim).filter(|value| !value.is_empty());
    let git_ref = match requested {
        Some(candidate) => run_git(
            &repo,
            &["rev-parse", "--verify", &format!("{candidate}^{{commit}}")],
        )
        .map(|_| candidate.to_string())
        .unwrap_or_else(|_| "HEAD".to_string()),
        None => "HEAD".to_string(),
    };

    let tree_output = run_git(&repo, &["ls-tree", "-r", "--name-only", &git_ref]).unwrap_or_default();
    let mut tree: Vec<String> = tree_output
        .lines()
        .map(str::trim)
        .filter(|path| is_code_path(path))
        .map(str::to_string)
        .collect();
    tree.truncate(200);

    let mut candidates: Vec<String> = paths
        .iter()
        .filter_map(|path| sanitize_repo_rel_path(path))
        .filter(|path| is_code_path(path))
        .take(6)
        .collect();
    if candidates.is_empty() && !keywords.is_empty() {
        candidates = grep_code_paths(&repo, &git_ref, keywords);
    }

    let mut files: Vec<Value> = Vec::new();
    let mut total_chars = 0usize;
    for path in candidates {
        if total_chars >= 24_000 {
            break;
        }
        let revision = format!("{git_ref}:{path}");
        let Ok(content) = run_git(&repo, &["show", &revision]) else {
            continue;
        };
        const MAX_FILE_CHARS: usize = 8_000;
        let truncated = content.chars().count() > MAX_FILE_CHARS;
        let content: String = content.chars().take(MAX_FILE_CHARS).collect();
        total_chars += content.chars().count();
        files.push(json!({
            "path": path,
            "content": content,
            "truncated": truncated,
        }));
    }

    Ok(json!({
        "gitRef": git_ref,
        "tree": tree,
        "files": files,
    }))
}

// ---------------------------------------------------------------------------
// watcher
// ---------------------------------------------------------------------------

struct ChangeGate {
    last: Mutex<Option<Instant>>,
    trailing: AtomicBool,
}

impl ChangeGate {
    fn new() -> Self {
        Self {
            last: Mutex::new(None),
            trailing: AtomicBool::new(false),
        }
    }

    /// 前缘立即触发，500ms 内的后续事件合并为一次尾随触发。
    fn trigger<F>(self: &Arc<Self>, emit: F)
    where
        F: FnOnce() + Send + 'static,
    {
        let now = Instant::now();
        let mut last = self.last.lock().unwrap();
        let ready = match *last {
            None => true,
            Some(previous) => now.duration_since(previous) >= WATCH_DEBOUNCE,
        };
        if ready {
            *last = Some(now);
            drop(last);
            emit();
            return;
        }
        drop(last);
        if self.trailing.swap(true, Ordering::SeqCst) {
            return;
        }
        let gate = self.clone();
        std::thread::spawn(move || {
            std::thread::sleep(WATCH_DEBOUNCE);
            gate.trailing.store(false, Ordering::SeqCst);
            *gate.last.lock().unwrap() = Some(Instant::now());
            emit();
        });
    }
}

fn start_repo_watcher(
    app: &tauri::AppHandle,
    repo_id: i64,
    repo_path: &str,
) -> Result<RecommendedWatcher, String> {
    let git_dir = git_absolute_dir(repo_path)?;
    let head = git_dir.join("HEAD");
    let refs = git_dir.join("refs");
    let index = git_dir.join("index");

    let gate = Arc::new(ChangeGate::new());
    let app_handle = app.clone();
    let mut watcher = notify::recommended_watcher(
        move |result: Result<notify::Event, notify::Error>| match result {
            Ok(event) => {
                if matches!(event.kind, notify::EventKind::Access(_)) {
                    return;
                }
                let app = app_handle.clone();
                gate.trigger(move || {
                    let _ = app.emit("local-repo-changed", json!({ "repoId": repo_id }));
                });
            }
            Err(error) => {
                eprintln!("[local-repo] watcher 错误 (repo {repo_id}): {error}");
            }
        },
    )
    .map_err(|e| format!("创建文件监听失败: {e}"))?;

    let mut watched = false;
    for (path, mode) in [
        (&head, RecursiveMode::NonRecursive),
        (&refs, RecursiveMode::Recursive),
        (&index, RecursiveMode::NonRecursive),
    ] {
        if path.exists() {
            watcher
                .watch(path, mode)
                .map_err(|e| format!("监听 {} 失败: {e}", path.display()))?;
            watched = true;
        }
    }
    if !watched {
        watcher
            .watch(&git_dir, RecursiveMode::Recursive)
            .map_err(|e| format!("监听 {} 失败: {e}", git_dir.display()))?;
    }
    Ok(watcher)
}

/// 读取全部绑定并为每个仓库重建 watcher；失败只打印日志，不阻断启动。
///
/// 由 `lib.rs` 的 setup 在 `app.manage(inner)` 之后调用；保存/删除绑定后也复用它。
pub fn restore_watchers(app: &tauri::AppHandle, state: &crate::AppState) {
    let bindings = match state.db.lock() {
        Ok(conn) => match list_local_repo_bindings(&conn) {
            Ok(bindings) => bindings,
            Err(error) => {
                eprintln!("[local-repo] 读取本地仓库绑定失败，跳过 watcher: {error}");
                return;
            }
        },
        Err(error) => {
            eprintln!("[local-repo] 数据库锁不可用，跳过 watcher: {error}");
            return;
        }
    };

    let mut watchers = match state.local_watchers.lock() {
        Ok(watchers) => watchers,
        Err(error) => {
            eprintln!("[local-repo] watcher 锁不可用: {error}");
            return;
        }
    };
    let ids: Vec<i64> = bindings.iter().map(|binding| binding.repo_id).collect();
    watchers.retain(|repo_id, _| ids.contains(repo_id));
    for binding in bindings {
        if watchers.contains_key(&binding.repo_id) {
            continue;
        }
        match start_repo_watcher(app, binding.repo_id, &binding.path) {
            Ok(watcher) => {
                watchers.insert(binding.repo_id, watcher);
            }
            Err(error) => {
                eprintln!(
                    "[local-repo] 启动 watcher 失败 (repo {}): {error}",
                    binding.repo_id
                );
            }
        }
    }
}

// ---------------------------------------------------------------------------
// 测试
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Output;

    fn git_available() -> bool {
        Command::new("git")
            .arg("--version")
            .output()
            .map(|output| output.status.success())
            .unwrap_or(false)
    }

    fn git(cwd: &Path, args: &[&str]) -> Output {
        Command::new("git")
            .current_dir(cwd)
            .args(args)
            .env("GIT_AUTHOR_NAME", "nervd-test")
            .env("GIT_AUTHOR_EMAIL", "nervd-test@example.com")
            .env("GIT_COMMITTER_NAME", "nervd-test")
            .env("GIT_COMMITTER_EMAIL", "nervd-test@example.com")
            .env("GIT_CONFIG_NOSYSTEM", "1")
            .output()
            .expect("执行 git 失败")
    }

    fn git_ok(cwd: &Path, args: &[&str]) -> String {
        let output = git(cwd, args);
        assert!(
            output.status.success(),
            "git {:?} 失败: {}",
            args,
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8_lossy(&output.stdout).to_string()
    }

    fn init_repo() -> tempfile::TempDir {
        let dir = tempfile::tempdir().expect("创建临时目录失败");
        git_ok(dir.path(), &["init", "-q"]);
        git_ok(dir.path(), &["config", "user.name", "nervd-test"]);
        git_ok(
            dir.path(),
            &["config", "user.email", "nervd-test@example.com"],
        );
        dir
    }

    fn commit_file(dir: &Path, name: &str, contents: &str, message: &str) {
        fs::write(dir.join(name), contents).expect("写文件失败");
        git_ok(dir, &["add", name]);
        git_ok(dir, &["commit", "-q", "-m", message]);
    }

    fn canonical(path: &Path) -> String {
        path_string(&fs::canonicalize(path).expect("canonicalize 失败"))
    }

    #[test]
    fn parses_local_commits_with_stats_and_merge_commits() {
        if !git_available() {
            eprintln!("skip: 当前环境没有 git");
            return;
        }
        let dir = init_repo();
        commit_file(dir.path(), "a.txt", "one\n", "first commit\n\nbody line");
        let base = git_ok(dir.path(), &["rev-parse", "--abbrev-ref", "HEAD"])
            .trim()
            .to_string();
        commit_file(dir.path(), "a.txt", "one\ntwo\n", "second commit");
        git_ok(dir.path(), &["checkout", "-q", "-b", "feature"]);
        commit_file(dir.path(), "b.txt", "feature\n", "feature commit");
        git_ok(dir.path(), &["checkout", "-q", &base]);
        git_ok(
            dir.path(),
            &[
                "merge",
                "-q",
                "--no-ff",
                "-m",
                "Merge branch 'feature'",
                "feature",
            ],
        );

        let commits =
            read_local_commits(&canonical(dir.path()), None, None).expect("读取本地提交失败");
        assert_eq!(commits.len(), 4, "应有 3 个普通提交 + 1 个 merge commit");

        let merge = commits
            .iter()
            .find(|commit| commit.message.starts_with("Merge "))
            .expect("缺少 merge commit");
        assert_eq!(merge.files_changed, 0, "merge commit 默认没有 numstat");
        assert_eq!(merge.additions, 0);
        assert_eq!(merge.deletions, 0);

        let first = commits
            .iter()
            .find(|commit| commit.message.starts_with("first commit"))
            .expect("缺少 first commit");
        assert!(first.message.contains("body line"));
        assert_eq!(first.additions, 1);
        assert_eq!(first.deletions, 0);
        assert_eq!(first.files_changed, 1);
        assert!(first.committed_at > 0);
        assert_eq!(first.author.as_deref(), Some("nervd-test"));
        assert_eq!(first.sha.len(), 40);
    }

    #[test]
    fn commit_msg_hook_fills_refs_and_req_then_uninstalls() {
        if !git_available() {
            eprintln!("skip: 当前环境没有 git");
            return;
        }
        let dir = init_repo();
        let repo = canonical(dir.path());
        let status = install_commit_msg_hook(&repo, "fill").expect("安装钩子失败");
        assert!(status.installed);
        assert_eq!(status.mode, "fill");

        let nervd_dir = dir.path().join(".nervd");
        fs::create_dir_all(&nervd_dir).expect("创建 .nervd 失败");
        fs::write(
            nervd_dir.join("active-workitem.json"),
            r#"{
  "repoId": 7,
  "workitemId": "task-uuid",
  "identifier": "TASK-42",
  "category": "Task",
  "parentWorkitemId": "req-uuid",
  "parentIdentifier": "REQ-7",
  "updatedAt": 1
}
"#,
        )
        .expect("写 active workitem 失败");

        git_ok(
            dir.path(),
            &["commit", "-q", "--allow-empty", "-m", "feat: add"],
        );
        let message = git_ok(dir.path(), &["log", "-1", "--format=%B"]);
        assert!(message.contains("Refs: TASK-42"), "实际消息: {message}");
        assert!(message.contains("Req: REQ-7"), "实际消息: {message}");

        let hook_path = commit_msg_hook_path(&repo).expect("解析钩子路径失败");
        uninstall_commit_msg_hook(&repo).expect("卸载钩子失败");
        assert!(!hook_path.exists(), "卸载后 nervd 钩子应被删除");
    }

    #[test]
    fn commit_msg_hook_uses_branch_identifier_without_active_file() {
        if !git_available() {
            eprintln!("skip: 当前环境没有 git");
            return;
        }
        let dir = init_repo();
        commit_file(dir.path(), "base.txt", "base\n", "chore: init");
        git_ok(
            dir.path(),
            &["checkout", "-q", "-b", "feature/REQ-321-demo"],
        );
        let repo = canonical(dir.path());
        install_commit_msg_hook(&repo, "fill").expect("安装钩子失败");
        git_ok(
            dir.path(),
            &[
                "commit",
                "-q",
                "--allow-empty",
                "-m",
                "fix: branch fallback",
            ],
        );
        let message = git_ok(dir.path(), &["log", "-1", "--format=%B"]);
        assert!(message.contains("Refs: REQ-321"), "实际消息: {message}");
        assert!(!message.contains("Req:"), "没有父需求时不应写 Req");
    }

    #[test]
    fn uninstall_restores_previous_hook_backup() {
        if !git_available() {
            eprintln!("skip: 当前环境没有 git");
            return;
        }
        let dir = init_repo();
        let repo = canonical(dir.path());
        let hook_path = commit_msg_hook_path(&repo).expect("解析钩子路径失败");
        if let Some(parent) = hook_path.parent() {
            fs::create_dir_all(parent).expect("创建 hooks 目录失败");
        }
        let original = "#!/bin/sh\n# user hook\nexit 0\n";
        fs::write(&hook_path, original).expect("写用户钩子失败");

        let status = install_commit_msg_hook(&repo, "enforce").expect("安装钩子失败");
        assert!(status.backup_path.is_some());
        let installed = fs::read_to_string(&hook_path).expect("读取钩子失败");
        assert!(installed.contains(HOOK_MARKER));
        assert_ne!(installed, original);

        uninstall_commit_msg_hook(&repo).expect("卸载钩子失败");
        let restored = fs::read_to_string(&hook_path).expect("读取恢复后的钩子失败");
        assert_eq!(restored, original);
    }

    #[test]
    fn inspect_and_read_work_with_spaces_in_path() {
        if !git_available() {
            eprintln!("skip: 当前环境没有 git");
            return;
        }
        let dir = tempfile::tempdir().expect("创建临时目录失败");
        let repo_path = dir.path().join("repo with space");
        fs::create_dir(&repo_path).expect("创建仓库目录失败");
        git_ok(&repo_path, &["init", "-q"]);
        git_ok(&repo_path, &["config", "user.name", "nervd-test"]);
        git_ok(
            &repo_path,
            &["config", "user.email", "nervd-test@example.com"],
        );
        git_ok(
            &repo_path,
            &["remote", "add", "origin", "git@example.com:space.git"],
        );
        commit_file(
            &repo_path,
            "file with space.txt",
            "content\n",
            "chore: init",
        );

        let repo = canonical(&repo_path);
        let info = inspect_local_repo(&repo).expect("探测仓库失败");
        assert!(info.is_git);
        assert_eq!(
            info.remote_url.as_deref(),
            Some("git@example.com:space.git")
        );
        assert!(info
            .current_branch
            .as_deref()
            .is_some_and(|b| !b.is_empty()));
        assert_eq!(info.head_sha.as_deref().map(str::len), Some(40));
        assert!(!info.dirty);

        fs::write(repo_path.join("dirty file.txt"), "dirty\n").expect("写 dirty 文件失败");
        let dirty = inspect_local_repo(&repo).expect("探测 dirty 仓库失败");
        assert!(dirty.dirty);

        let commits = read_local_commits(&repo, None, None).expect("读取提交失败");
        assert_eq!(commits.len(), 1);
        assert_eq!(commits[0].files_changed, 1);
    }

    #[test]
    fn rebinding_to_new_path_resets_stale_hook_state() {
        let conn = Connection::open_in_memory().expect("打开内存库失败");
        crate::db::init_conn(&conn).expect("初始化表失败");
        upsert_local_repo_binding(&conn, 1, "/tmp/repo-old", None, Some("main"), 100)
            .expect("保存绑定失败");
        set_local_repo_hook_state(&conn, 1, true, "enforce", 110).expect("更新钩子状态失败");

        // 同路径更新：保留钩子状态（钩子文件还在原目录，仍然有效）
        let same = upsert_local_repo_binding(&conn, 1, "/tmp/repo-old", None, Some("main"), 120)
            .expect("更新绑定失败");
        assert!(same.hook_installed, "同路径更新不应清空钩子状态");
        assert_eq!(same.hook_mode, "enforce");

        // 换目录：旧目录的钩子不跟随，必须清空状态并在新目录重新核对
        let moved = upsert_local_repo_binding(&conn, 1, "/tmp/repo-new", None, Some("main"), 130)
            .expect("换路径失败");
        assert!(!moved.hook_installed, "换目录后不应沿用旧路径的钩子状态");
        assert_eq!(moved.hook_mode, "fill");
    }

    #[test]
    fn read_repo_code_context_returns_tree_and_keyword_matches() {
        if !git_available() {
            eprintln!("skip: 当前环境没有 git");
            return;
        }
        let dir = init_repo();
        commit_file(
            dir.path(),
            "cashier-pay.js",
            "// 收银台支付入口\nexport const pay = () => 'yibao';\n",
            "feat: cashier pay",
        );
        commit_file(dir.path(), "other.js", "export const other = 1;\n", "chore: other");
        let repo = canonical(dir.path());

        let context = read_repo_code_context(
            &repo,
            None,
            &[],
            &["收银".to_string(), "yibao".to_string()],
        )
        .expect("读取代码上下文失败");
        let tree = context["tree"].as_array().expect("tree 缺失");
        assert!(tree.iter().any(|item| item.as_str() == Some("cashier-pay.js")));

        let files = context["files"].as_array().expect("files 缺失");
        assert!(!files.is_empty(), "关键词应命中代码文件");
        assert!(files
            .iter()
            .any(|file| file["path"].as_str() == Some("cashier-pay.js")));

        // 路径穿越必须被拒绝
        let guarded = read_repo_code_context(&repo, None, &["../../etc/passwd".to_string()], &[])
            .expect("空路径应返回空上下文");
        assert!(guarded["files"].as_array().map(Vec::is_empty).unwrap_or(false));
    }

    #[test]
    fn enforce_hook_rejects_non_conventional_subject() {
        if !git_available() {
            eprintln!("skip: 当前环境没有 git");
            return;
        }
        let dir = init_repo();
        commit_file(dir.path(), "a.txt", "a\n", "chore: init");
        git_ok(dir.path(), &["checkout", "-q", "-b", "feature/TASK-1"]);
        let repo = canonical(dir.path());
        install_commit_msg_hook(&repo, "enforce").expect("安装钩子失败");

        let bad = Command::new("git")
            .arg("-C")
            .arg(&repo)
            .args(["commit", "-q", "--allow-empty", "-m", "update cashier"])
            .output()
            .expect("执行 git commit 失败");
        assert!(!bad.status.success(), "非规范标题应被 enforce 钩子拒绝");
        let stderr = String::from_utf8_lossy(&bad.stderr);
        assert!(stderr.contains("Conventional Commits"), "实际 stderr: {stderr}");

        let good = Command::new("git")
            .arg("-C")
            .arg(&repo)
            .args(["commit", "-q", "--allow-empty", "-m", "feat(cashier): 接入易宝支付"])
            .output()
            .expect("执行 git commit 失败");
        assert!(
            good.status.success(),
            "规范标题应允许提交: {}",
            String::from_utf8_lossy(&good.stderr)
        );
    }

    #[test]
    fn inspect_reports_actual_hook_state() {
        if !git_available() {
            eprintln!("skip: 当前环境没有 git");
            return;
        }
        let dir = init_repo();
        let repo = canonical(dir.path());
        let before = inspect_local_repo(&repo).expect("探测仓库失败");
        assert!(!before.hook_installed);
        assert_eq!(before.hook_mode, "off");

        install_commit_msg_hook(&repo, "enforce").expect("安装钩子失败");
        let after = inspect_local_repo(&repo).expect("探测仓库失败");
        assert!(after.hook_installed);
        assert_eq!(after.hook_mode, "enforce");
        assert!(after.hook_path.is_some());
    }

    #[test]
    fn binding_store_roundtrip_and_path_conflict() {
        let conn = Connection::open_in_memory().expect("打开内存库失败");
        crate::db::init_conn(&conn).expect("初始化表失败");

        let first = upsert_local_repo_binding(
            &conn,
            1,
            "/tmp/repo-one",
            Some("git@example.com:one.git"),
            Some("main"),
            100,
        )
        .expect("保存绑定失败");
        assert_eq!(first.repo_id, 1);
        assert_eq!(first.hook_mode, "fill");
        assert!(!first.hook_installed);

        let updated = upsert_local_repo_binding(
            &conn,
            1,
            "/tmp/repo-one",
            Some("git@example.com:one-new.git"),
            Some("master"),
            200,
        )
        .expect("更新绑定失败");
        assert_eq!(
            updated.remote_url.as_deref(),
            Some("git@example.com:one-new.git")
        );
        assert_eq!(updated.default_branch.as_deref(), Some("master"));
        assert_eq!(updated.updated_at, 200);

        set_local_repo_hook_state(&conn, 1, true, "enforce", 300).expect("更新钩子状态失败");
        let with_hook = get_local_repo_binding(&conn, 1)
            .expect("读取绑定失败")
            .expect("绑定不存在");
        assert!(with_hook.hook_installed);
        assert_eq!(with_hook.hook_mode, "enforce");

        let conflict = upsert_local_repo_binding(
            &conn,
            2,
            "/tmp/repo-one",
            Some("git@example.com:two.git"),
            Some("main"),
            400,
        )
        .expect_err("路径冲突应失败");
        assert!(conflict.contains("已绑定"), "实际错误: {conflict}");

        assert!(delete_local_repo_binding(&conn, 1).expect("删除绑定失败"));
        assert!(list_local_repo_bindings(&conn)
            .expect("列表失败")
            .is_empty());
        assert!(!delete_local_repo_binding(&conn, 1).expect("重复删除应返回 false"));
    }

    #[test]
    fn active_workitem_json_and_legacy_text_are_readable() {
        if !git_available() {
            eprintln!("skip: 当前环境没有 git");
            return;
        }
        let dir = init_repo();
        commit_file(dir.path(), "a.txt", "a\n", "chore: init");
        let repo = canonical(dir.path());

        let conn = Connection::open_in_memory().expect("打开内存库失败");
        crate::db::init_conn(&conn).expect("初始化表失败");
        upsert_local_repo_binding(&conn, 9, &repo, None, None, 1).expect("保存绑定失败");

        let nervd_dir = dir.path().join(".nervd");
        fs::create_dir_all(&nervd_dir).expect("创建 .nervd 失败");
        fs::write(
            nervd_dir.join("active-workitem.json"),
            r#"{"workitemId":"wid","identifier":"BUG-9","category":"Bug","parentIdentifier":"REQ-1"}"#,
        )
        .expect("写 active JSON 失败");
        let binding = get_local_repo_binding(&conn, 9)
            .expect("读取绑定失败")
            .expect("绑定不应为空");
        let active = read_active_workitem_at(binding.repo_id, &binding.path)
            .expect("读取 active 失败")
            .expect("active 不应为空");
        assert_eq!(active.repo_id, 9);
        assert_eq!(active.identifier, "BUG-9");
        assert_eq!(active.category, "Bug");
        assert_eq!(active.parent_identifier.as_deref(), Some("REQ-1"));

        fs::remove_file(nervd_dir.join("active-workitem.json")).expect("删除 active JSON 失败");
        let git_dir = git_absolute_dir(&repo).expect("解析 git dir 失败");
        // 旧格式契约：identifier / workitem_id / parent_identifier / parent_workitem_id
        fs::write(
            git_dir.join("nervd-active-workitem"),
            "TASK-7\ntask-wid\nREQ-3\nreq-wid\n",
        )
        .expect("写 legacy active 失败");
        let active = read_active_workitem_at(binding.repo_id, &binding.path)
            .expect("读取 legacy active 失败")
            .expect("legacy active 不应为空");
        assert_eq!(active.identifier, "TASK-7");
        assert_eq!(active.workitem_id, "task-wid");
        assert_eq!(active.category, "Task");
        assert_eq!(active.parent_identifier.as_deref(), Some("REQ-3"));
        assert_eq!(active.parent_workitem_id.as_deref(), Some("req-wid"));
    }

    #[test]
    fn watcher_errors_are_contained_and_hook_mode_is_validated() {
        assert!(normalize_hook_mode(Some("FILL")).is_ok());
        assert!(normalize_hook_mode(None).unwrap() == "fill");
        assert!(normalize_hook_mode(Some("nonsense")).is_err());
        assert!(inspect_local_repo("/definitely/not/a/repo").is_err());
    }

    #[test]
    fn agent_scaffold_generates_task_markdown_and_scripts() {
        if !git_available() {
            eprintln!("skip: 当前环境没有 git");
            return;
        }
        let dir = init_repo();
        commit_file(dir.path(), "a.txt", "a\n", "chore: init");
        let repo = canonical(dir.path());
        let active = ActiveWorkitem {
            repo_id: 101,
            workitem_id: "wi-task-101".into(),
            identifier: "TASK-101".into(),
            category: "Task".into(),
            parent_workitem_id: Some("wi-req-100".into()),
            parent_identifier: Some("REQ-100".into()),
            updated_at: 1_700_000_000,
        };
        write_agent_scaffold(&repo, &active, Some("完成交付摘要联调")).expect("生成脚手架失败");

        let nervd = dir.path().join(".nervd");
        assert_eq!(
            fs::read_to_string(nervd.join(".gitignore")).expect("读 .gitignore 失败"),
            "*\n"
        );
        let markdown = fs::read_to_string(nervd.join("agent-task.md")).expect("读 agent-task 失败");
        assert!(markdown.contains("TASK-101"), "缺少工作项编号");
        assert!(markdown.contains("REQ-100"), "缺少父需求编号");
        assert!(markdown.contains("完成交付摘要联调"), "缺少任务标题");
        assert!(
            markdown.contains("./.nervd/scripts/agent-commit.sh --workitem TASK-101 --req REQ-100"),
            "缺少推荐提交命令"
        );
        for name in [
            "lib-attribution.sh",
            "agent-commit.sh",
            "read-active-workitem.sh",
            "check-commit-attribution.sh",
        ] {
            let path = nervd.join("scripts").join(name);
            assert!(path.is_file(), "缺少脚本 {name}");
            assert!(
                fs::metadata(&path)
                    .expect("读脚本元数据失败")
                    .len()
                    > 0,
                "脚本为空: {name}"
            );
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let mode = fs::metadata(&path)
                    .expect("读脚本权限失败")
                    .permissions()
                    .mode();
                assert_eq!(mode & 0o111, 0o111, "脚本应可执行: {name}");
            }
        }
    }

}
