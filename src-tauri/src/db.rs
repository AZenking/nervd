use std::fs;
use std::path::PathBuf;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalTaskRepoLink {
    pub repo_id: i64,
    pub repo_name: String,
    pub branch_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalTask {
    pub id: String,
    pub title: String,
    pub status: String,
    pub repos: Vec<LocalTaskRepoLink>,
    pub repo_id: Option<i64>,
    pub repo_name: Option<String>,
    pub branch_name: Option<String>,
    pub description: Option<String>,
    pub priority: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTaskPayload {
    pub id: Option<String>,
    pub title: String,
    pub status: Option<String>,
    pub repos: Option<Vec<LocalTaskRepoLink>>,
    pub repo_id: Option<i64>,
    pub repo_name: Option<String>,
    pub branch_name: Option<String>,
    pub description: Option<String>,
    pub priority: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTaskPayload {
    pub title: Option<String>,
    pub status: Option<String>,
    pub repos: Option<Vec<LocalTaskRepoLink>>,
    pub repo_id: Option<i64>,
    pub repo_name: Option<String>,
    pub branch_name: Option<String>,
    pub description: Option<String>,
    pub priority: Option<String>,
}

fn get_db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取应用数据目录失败: {e}"))?;
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("创建应用数据目录失败: {e}"))?;
    }
    Ok(dir.join("nervd.db"))
}

pub fn init_db(app: &tauri::AppHandle) -> Result<Connection, String> {
    let path = get_db_path(app)?;
    let conn = Connection::open(&path).map_err(|e| format!("打开 SQLite 数据库失败: {e}"))?;

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS local_tasks (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'todo',
            repo_id INTEGER,
            repo_name TEXT,
            branch_name TEXT,
            description TEXT,
            priority TEXT DEFAULT 'none',
            repos_json TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_tasks_status ON local_tasks(status);
        CREATE INDEX IF NOT EXISTS idx_tasks_updated ON local_tasks(updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_tasks_repo ON local_tasks(repo_id);
        ",
    )
    .map_err(|e| format!("初始化数据表失败: {e}"))?;

    // 自动热迁移：如果旧表没有 repos_json 列，增加该列
    let has_repos_json = {
        let mut pragma = conn
            .prepare("PRAGMA table_info(local_tasks)")
            .map_err(|e| e.to_string())?;
        let col_names: Vec<String> = pragma
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        col_names.iter().any(|name| name == "repos_json")
    };
    if !has_repos_json {
        let _ = conn.execute("ALTER TABLE local_tasks ADD COLUMN repos_json TEXT", []);
    }

    Ok(conn)
}

fn parse_repos(
    repos_json: Option<String>,
    single_repo_id: Option<i64>,
    single_repo_name: Option<String>,
    single_branch_name: Option<String>,
) -> Vec<LocalTaskRepoLink> {
    if let Some(ref json_str) = repos_json {
        if let Ok(links) = serde_json::from_str::<Vec<LocalTaskRepoLink>>(json_str) {
            if !links.is_empty() {
                return links;
            }
        }
    }
    if let (Some(r_id), Some(r_name)) = (single_repo_id, single_repo_name) {
        vec![LocalTaskRepoLink {
            repo_id: r_id,
            repo_name: r_name,
            branch_name: single_branch_name,
        }]
    } else {
        Vec::new()
    }
}

pub fn list_tasks(
    conn: &Connection,
    status: Option<&str>,
    search: Option<&str>,
) -> Result<Vec<LocalTask>, String> {
    let mut query = "SELECT id, title, status, repo_id, repo_name, branch_name, description, priority, repos_json, created_at, updated_at FROM local_tasks WHERE 1=1".to_string();
    let mut params_vec: Vec<rusqlite::types::Value> = Vec::new();

    if let Some(st) = status {
        let st = st.trim();
        if !st.is_empty() && st != "all" {
            query.push_str(" AND status = ?");
            params_vec.push(st.to_string().into());
        }
    }

    if let Some(q) = search {
        let q = q.trim();
        if !q.is_empty() {
            query.push_str(" AND (title LIKE ? OR description LIKE ? OR branch_name LIKE ? OR repo_name LIKE ? OR repos_json LIKE ?)");
            let pattern = format!("%{q}%");
            params_vec.push(pattern.clone().into());
            params_vec.push(pattern.clone().into());
            params_vec.push(pattern.clone().into());
            params_vec.push(pattern.clone().into());
            params_vec.push(pattern.into());
        }
    }

    query.push_str(" ORDER BY updated_at DESC");

    let mut stmt = conn
        .prepare(&query)
        .map_err(|e| format!("准备 SQL 失败: {e}"))?;

    let rusqlite_params = rusqlite::params_from_iter(params_vec.iter());
    let rows = stmt
        .query_map(rusqlite_params, |row| {
            let id: String = row.get(0)?;
            let title: String = row.get(1)?;
            let status: String = row.get(2)?;
            let repo_id: Option<i64> = row.get(3)?;
            let repo_name: Option<String> = row.get(4)?;
            let branch_name: Option<String> = row.get(5)?;
            let description: Option<String> = row.get(6)?;
            let priority: String = row.get(7)?;
            let repos_json: Option<String> = row.get(8)?;
            let created_at: i64 = row.get(9)?;
            let updated_at: i64 = row.get(10)?;

            let repos = parse_repos(
                repos_json,
                repo_id,
                repo_name.clone(),
                branch_name.clone(),
            );

            // 如果没有单字段但 repos 有项，以第一项作为单字段向后兼容
            let (final_repo_id, final_repo_name, final_branch) = if let Some(first) = repos.first() {
                (Some(first.repo_id), Some(first.repo_name.clone()), first.branch_name.clone())
            } else {
                (repo_id, repo_name, branch_name)
            };

            Ok(LocalTask {
                id,
                title,
                status,
                repos,
                repo_id: final_repo_id,
                repo_name: final_repo_name,
                branch_name: final_branch,
                description,
                priority,
                created_at,
                updated_at,
            })
        })
        .map_err(|e| format!("查询数据失败: {e}"))?;

    let mut list = Vec::new();
    for r in rows {
        list.push(r.map_err(|e| format!("解析行数据失败: {e}"))?);
    }
    Ok(list)
}

pub fn create_task(conn: &Connection, payload: CreateTaskPayload) -> Result<LocalTask, String> {
    let title = payload.title.trim();
    if title.is_empty() {
        return Err("任务标题不能为空".into());
    }
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as i64;

    let id = payload
        .id
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| format!("lt-{}", now));

    let status = payload
        .status
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "todo".to_string());

    let priority = payload
        .priority
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "none".to_string());

    let repos = if let Some(r_list) = payload.repos {
        r_list
    } else if let (Some(r_id), Some(r_name)) = (payload.repo_id, payload.repo_name.clone()) {
        vec![LocalTaskRepoLink {
            repo_id: r_id,
            repo_name: r_name,
            branch_name: payload.branch_name.clone(),
        }]
    } else {
        Vec::new()
    };

    let repos_json = if repos.is_empty() {
        None
    } else {
        serde_json::to_string(&repos).ok()
    };

    let (first_repo_id, first_repo_name, first_branch) = if let Some(first) = repos.first() {
        (Some(first.repo_id), Some(first.repo_name.clone()), first.branch_name.clone())
    } else {
        (payload.repo_id, payload.repo_name.clone(), payload.branch_name.clone())
    };

    conn.execute(
        "INSERT INTO local_tasks (id, title, status, repo_id, repo_name, branch_name, description, priority, repos_json, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            id,
            title,
            status,
            first_repo_id,
            first_repo_name,
            first_branch,
            payload.description,
            priority,
            repos_json,
            now,
            now
        ],
    )
    .map_err(|e| format!("插入本地任务失败: {e}"))?;

    Ok(LocalTask {
        id,
        title: title.to_string(),
        status,
        repos,
        repo_id: first_repo_id,
        repo_name: first_repo_name,
        branch_name: first_branch,
        description: payload.description,
        priority,
        created_at: now,
        updated_at: now,
    })
}

pub fn update_task(
    conn: &Connection,
    id: &str,
    payload: UpdateTaskPayload,
) -> Result<LocalTask, String> {
    let existing = conn
        .query_row(
            "SELECT id, title, status, repo_id, repo_name, branch_name, description, priority, repos_json, created_at, updated_at FROM local_tasks WHERE id = ?1",
            params![id],
            |row| {
                let id: String = row.get(0)?;
                let title: String = row.get(1)?;
                let status: String = row.get(2)?;
                let repo_id: Option<i64> = row.get(3)?;
                let repo_name: Option<String> = row.get(4)?;
                let branch_name: Option<String> = row.get(5)?;
                let description: Option<String> = row.get(6)?;
                let priority: String = row.get(7)?;
                let repos_json: Option<String> = row.get(8)?;
                let created_at: i64 = row.get(9)?;
                let updated_at: i64 = row.get(10)?;

                let repos = parse_repos(
                    repos_json,
                    repo_id,
                    repo_name.clone(),
                    branch_name.clone(),
                );

                let (final_repo_id, final_repo_name, final_branch) = if let Some(first) = repos.first() {
                    (Some(first.repo_id), Some(first.repo_name.clone()), first.branch_name.clone())
                } else {
                    (repo_id, repo_name, branch_name)
                };

                Ok(LocalTask {
                    id,
                    title,
                    status,
                    repos,
                    repo_id: final_repo_id,
                    repo_name: final_repo_name,
                    branch_name: final_branch,
                    description,
                    priority,
                    created_at,
                    updated_at,
                })
            },
        )
        .map_err(|e| format!("未找到该本地任务({id}): {e}"))?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as i64;

    let new_title = payload.title.unwrap_or(existing.title);
    let new_status = payload.status.unwrap_or(existing.status);
    let new_description = payload.description.or(existing.description);
    let new_priority = payload.priority.unwrap_or(existing.priority);

    let new_repos = if let Some(r_list) = payload.repos {
        r_list
    } else if payload.repo_id.is_some() || payload.repo_name.is_some() || payload.branch_name.is_some() {
        let r_id = payload.repo_id.or(existing.repo_id);
        let r_name = payload.repo_name.or(existing.repo_name.clone());
        let b_name = payload.branch_name.or(existing.branch_name.clone());
        if let (Some(id_val), Some(name_val)) = (r_id, r_name) {
            vec![LocalTaskRepoLink {
                repo_id: id_val,
                repo_name: name_val,
                branch_name: b_name,
            }]
        } else {
            Vec::new()
        }
    } else {
        existing.repos
    };

    let new_repos_json = if new_repos.is_empty() {
        None
    } else {
        serde_json::to_string(&new_repos).ok()
    };

    let (new_repo_id, new_repo_name, new_branch_name) = if let Some(first) = new_repos.first() {
        (Some(first.repo_id), Some(first.repo_name.clone()), first.branch_name.clone())
    } else {
        (None, None, None)
    };

    conn.execute(
        "UPDATE local_tasks SET title = ?1, status = ?2, repo_id = ?3, repo_name = ?4, branch_name = ?5, description = ?6, priority = ?7, repos_json = ?8, updated_at = ?9 WHERE id = ?10",
        params![
            new_title,
            new_status,
            new_repo_id,
            new_repo_name,
            new_branch_name,
            new_description,
            new_priority,
            new_repos_json,
            now,
            id
        ],
    )
    .map_err(|e| format!("更新本地任务失败: {e}"))?;

    Ok(LocalTask {
        id: id.to_string(),
        title: new_title,
        status: new_status,
        repos: new_repos,
        repo_id: new_repo_id,
        repo_name: new_repo_name,
        branch_name: new_branch_name,
        description: new_description,
        priority: new_priority,
        created_at: existing.created_at,
        updated_at: now,
    })
}

pub fn delete_task(conn: &Connection, id: &str) -> Result<bool, String> {
    let affected = conn
        .execute("DELETE FROM local_tasks WHERE id = ?1", params![id])
        .map_err(|e| format!("删除本地任务失败: {e}"))?;
    Ok(affected > 0)
}
