//! 流水线轮询：latestPipelineRun 状态迁移 → 前端事件 + 系统通知（openapi-rdc 版）
//!
//! 健壮性约定：
//! - 两条扫描线（云效 / Jenkins）各自独立失败退避：60s → 2min → 5min，成功即复位；
//! - Jenkins Token 常驻内存（settings / 连接配置变更时失效），不再每轮访问 Keychain；
//! - 单请求与整轮扫描都有超时上限，避免慢请求拖住后续轮询；
//! - 窗口不可见时降频（10 分钟）而不是停轮询，后台构建完成仍能发系统通知。

use crate::yunxiao::YunxiaoClient;
use crate::AppState;
use crate::{commands, credentials, jenkins::JenkinsClient};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::Emitter;

/// 调度器最小时间片（决定退避/降频的触发精度）
const TICK: Duration = Duration::from_secs(15);
/// 窗口可见时的基准轮询间隔
const POLL_INTERVAL: Duration = Duration::from_secs(60);
/// 窗口隐藏/最小化时的降频间隔
const HIDDEN_POLL_INTERVAL: Duration = Duration::from_secs(600);
/// 失败退避阶梯（第 1/2/3+ 次连续失败）
const BACKOFF_STEPS: [Duration; 3] = [
    Duration::from_secs(60),
    Duration::from_secs(120),
    Duration::from_secs(300),
];
/// 单轮扫描总超时（防止 20 条流水线 × 单请求超时把一轮拖到十分钟）
const SCAN_TIMEOUT: Duration = Duration::from_secs(90);
/// 单请求超时（比 HTTP 客户端自带的 30s 略微放宽，用于给出轮询层可读错误）
const REQUEST_TIMEOUT: Duration = Duration::from_secs(35);
/// Jenkins Token 内存缓存有效期（覆盖权限轮换；失效后可重新读 Keychain）
const TOKEN_TTL: Duration = Duration::from_secs(600);

const MAX_PIPELINES: &str = "20";
const TERMINAL: [&str; 3] = ["SUCCESS", "FAIL", "CANCELED"];

/// 单条扫描线的调度与退避状态
struct LineSchedule {
    next_at: Instant,
    consecutive_failures: usize,
}

impl LineSchedule {
    fn immediate() -> Self {
        Self {
            next_at: Instant::now(),
            consecutive_failures: 0,
        }
    }

    fn is_due(&self, now: Instant) -> bool {
        now >= self.next_at
    }

    fn finish(&mut self, base: Duration, ok: bool) {
        if ok {
            self.consecutive_failures = 0;
            self.next_at = Instant::now() + base;
        } else {
            self.consecutive_failures = (self.consecutive_failures + 1).min(BACKOFF_STEPS.len());
            let delay = BACKOFF_STEPS[self.consecutive_failures - 1].max(base);
            self.next_at = Instant::now() + delay;
        }
    }
}

/// Jenkins Token 内存缓存：key = connection.id。
/// `sync_settings` 在 settings（含连接地址/用户名）变化时整体失效；
/// 认证失败时 `invalidate` 单条，避免 Token 轮换后一直用旧值。
#[derive(Default)]
struct TokenCache {
    entries: HashMap<String, (Option<String>, Instant)>,
    settings: Option<credentials::Settings>,
}

impl TokenCache {
    fn sync_settings(&mut self, settings: &credentials::Settings) {
        if self.settings.as_ref() != Some(settings) {
            self.entries.clear();
            self.settings = Some(settings.clone());
        }
    }

    fn get(&mut self, connection_id: &str) -> Option<String> {
        if let Some((token, fetched_at)) = self.entries.get(connection_id) {
            if fetched_at.elapsed() < TOKEN_TTL {
                return token.clone();
            }
        }
        // 只有缓存未命中/过期才触发 Keychain；未配置 Token 也做负缓存，避免每轮弹 Keychain
        let token = credentials::load_jenkins_token(connection_id);
        self.entries
            .insert(connection_id.to_string(), (token.clone(), Instant::now()));
        token
    }

    fn invalidate(&mut self, connection_id: &str) {
        self.entries.remove(connection_id);
    }
}

/// 窗口可见性：拿不到 API/信息时视为可见（不臆造状态，保持正常轮询）
fn window_visible(app: &tauri::AppHandle) -> bool {
    use tauri::Manager;
    let Some(window) = app.get_webview_window("main") else {
        return true;
    };
    match (window.is_visible(), window.is_minimized()) {
        (Ok(visible), Ok(minimized)) => visible && !minimized,
        _ => true,
    }
}

pub fn spawn(app: tauri::AppHandle, inner: AppState) {
    tauri::async_runtime::spawn(async move {
        // key = "pipelineId:runId" / "connection:job:runId" -> 上次状态
        let mut seen: HashMap<String, String> = HashMap::new();
        let mut seen_jenkins: HashMap<String, String> = HashMap::new();
        let mut cloud_schedule = LineSchedule::immediate();
        let mut jenkins_schedule = LineSchedule::immediate();
        let mut tokens = TokenCache::default();

        loop {
            tokio::time::sleep(TICK).await;
            let (client, settings, visible) = {
                let c = inner.client.lock().unwrap().clone();
                let s = inner.settings.lock().unwrap().clone();
                (c, s, window_visible(&app))
            };
            // settings 或连接配置变更 → Token 缓存整体失效
            tokens.sync_settings(&settings);

            let now = Instant::now();
            let base = if visible {
                POLL_INTERVAL
            } else {
                HIDDEN_POLL_INTERVAL
            };
            let run_cloud = cloud_schedule.is_due(now);
            let run_jenkins = jenkins_schedule.is_due(now);
            if !run_cloud && !run_jenkins {
                continue;
            }

            // 两条扫描线并行，互不拖慢（共用同一取消/超时预算）
            let cloud_fut = async {
                if !run_cloud {
                    return Ok(());
                }
                let Some(client) = client.as_ref() else {
                    return Ok(());
                };
                if settings.organization_id.trim().is_empty() {
                    return Ok(());
                }
                match tokio::time::timeout(
                    SCAN_TIMEOUT,
                    scan_once(&app, client, &settings.organization_id, &mut seen),
                )
                .await
                {
                    Ok(result) => result,
                    Err(_) => Err(format!("云效扫描超时（>{}s）", SCAN_TIMEOUT.as_secs())),
                }
            };
            let jenkins_fut = async {
                if !run_jenkins {
                    return Ok(());
                }
                match tokio::time::timeout(
                    SCAN_TIMEOUT,
                    scan_jenkins_once(&app, &inner, &settings, &mut seen_jenkins, &mut tokens),
                )
                .await
                {
                    Ok(result) => result,
                    Err(_) => Err(format!("Jenkins 扫描超时（>{}s）", SCAN_TIMEOUT.as_secs())),
                }
            };
            let (cloud_result, jenkins_result) = tokio::join!(cloud_fut, jenkins_fut);

            if run_cloud {
                match cloud_result {
                    Ok(()) => cloud_schedule.finish(base, true),
                    Err(e) => {
                        eprintln!("[poller] {e}");
                        cloud_schedule.finish(base, false);
                    }
                }
            }
            if run_jenkins {
                match jenkins_result {
                    Ok(()) => jenkins_schedule.finish(base, true),
                    Err(e) => {
                        eprintln!("[jenkins-poller] {e}");
                        jenkins_schedule.finish(base, false);
                    }
                }
            }

            if seen.len() > 500 {
                seen.retain(|_, v| v == "RUNNING" || v == "WAITING");
            }
            if seen_jenkins.len() > 500 {
                seen_jenkins.retain(|_, v| v == "RUNNING" || v == "WAITING");
            }
        }
    });
}

/// 单请求超时封装（云效 HTTP 客户端自带 30s，这里给出轮询层可读错误并留出余量）
async fn request_timeout<F>(label: &str, fut: F) -> Result<Value, String>
where
    F: std::future::Future<Output = Result<Value, String>>,
{
    match tokio::time::timeout(REQUEST_TIMEOUT, fut).await {
        Ok(result) => result,
        Err(_) => Err(format!(
            "{label} 请求超时（>{}s）",
            REQUEST_TIMEOUT.as_secs()
        )),
    }
}

async fn scan_jenkins_once(
    app: &tauri::AppHandle,
    app_state: &AppState,
    settings: &credentials::Settings,
    seen: &mut HashMap<String, String>,
    tokens: &mut TokenCache,
) -> Result<(), String> {
    let mut jobs: HashMap<String, (credentials::JenkinsConnection, Vec<i64>, String)> =
        HashMap::new();
    for (repo_id, connection, job_full_name) in commands::repo_jenkins_jobs(settings) {
        let key = commands::jenkins_job_key(&connection.id, &job_full_name);
        jobs.entry(key)
            .and_modify(|(_, repos, _)| repos.push(repo_id))
            .or_insert((connection, vec![repo_id], job_full_name));
    }
    let total = jobs.len();
    let mut failures: Vec<String> = Vec::new();

    for (key, (connection, mut repo_ids, job_full_name)) in jobs {
        repo_ids.sort_unstable();
        let Some(token) = tokens.get(&connection.id) else {
            failures.push(format!("{} 缺少 API Token", connection.id));
            continue;
        };
        let Ok(client) = JenkinsClient::new(&connection.base_url, &connection.username, &token)
        else {
            failures.push(format!("{} 连接配置无效", connection.id));
            continue;
        };
        let runs = match tokio::time::timeout(REQUEST_TIMEOUT, client.list_runs(&job_full_name, 1))
            .await
        {
            Ok(Ok(runs)) => runs,
            Ok(Err(e)) => {
                // 凭证可能已轮换：失效缓存，下一轮重新读 Keychain
                if e.contains("401") || e.contains("403") {
                    tokens.invalidate(&connection.id);
                }
                failures.push(format!("{job_full_name}: {e}"));
                continue;
            }
            Err(_) => {
                failures.push(format!(
                    "{job_full_name}: 请求超时（>{}s）",
                    REQUEST_TIMEOUT.as_secs()
                ));
                continue;
            }
        };
        let Some((run_id, status)) = commands::latest_jenkins_run(&runs) else {
            continue;
        };
        let run_key = format!("{key}:{run_id}");
        let previous = seen.insert(run_key, status.clone());
        let run_number = run_id.parse::<i64>().ok();
        let triggered_since = app_state
            .jenkins_trigger_baselines
            .lock()
            .unwrap()
            .get(&key)
            .and_then(|baselines| baselines.first())
            .copied()
            .zip(run_number)
            .is_some_and(|(baseline, current)| current > baseline);
        if commands::should_notify_jenkins_completion(previous.as_deref(), &status, triggered_since)
        {
            let payload = json!({
                "connectionId": connection.id,
                "jobFullName": job_full_name,
                "runId": run_id,
                "status": status,
                "repoIds": repo_ids,
            });
            let _ = app.emit("jenkins-build-finished", payload);
            use tauri_plugin_notification::NotificationExt;
            let _ = app
                .notification()
                .builder()
                .title("nervd · Jenkins 构建完成")
                .body(format!("{} #{run_id} → {status}", job_full_name))
                .show();

            let mut baselines = app_state.jenkins_trigger_baselines.lock().unwrap();
            if let Some(pending) = baselines.get_mut(&key) {
                if !pending.is_empty() {
                    pending.remove(0);
                }
                if pending.is_empty() {
                    baselines.remove(&key);
                }
            }
        }
    }

    if failures.is_empty() {
        return Ok(());
    }
    let shown = failures
        .iter()
        .take(3)
        .cloned()
        .collect::<Vec<_>>()
        .join("; ");
    Err(format!(
        "{}/{} 个 Jenkins Job 轮询失败: {shown}",
        failures.len(),
        total
    ))
}

async fn scan_once(
    app: &tauri::AppHandle,
    client: &Arc<YunxiaoClient>,
    org: &str,
    seen: &mut HashMap<String, String>,
) -> Result<(), String> {
    let resp = request_timeout(
        "流水线列表",
        client.get(
            &format!("/oapi/v1/flow/organizations/{org}/pipelines"),
            &[
                ("page", "1".to_string()),
                ("perPage", MAX_PIPELINES.to_string()),
            ],
        ),
    )
    .await?;
    let pipelines = resp.as_array().cloned().unwrap_or_else(|| {
        resp.get("pipelines")
            .and_then(|x| x.as_array())
            .cloned()
            .unwrap_or_default()
    });

    let mut queried = 0usize;
    let mut failures = 0usize;
    for p in &pipelines {
        let pid = p
            .get("id")
            .and_then(|x| x.as_i64())
            .or_else(|| p.get("pipelineId").and_then(|x| x.as_i64()))
            .unwrap_or(0);
        let pname = p
            .get("name")
            .and_then(|x| x.as_str())
            .or_else(|| p.get("pipelineName").and_then(|x| x.as_str()))
            .unwrap_or("?");
        if pid == 0 {
            continue;
        }
        queried += 1;
        let latest = match request_timeout(
            &format!("流水线 {pid} 最新运行"),
            client.get(
                &format!(
                    "/oapi/v1/flow/organizations/{org}/pipelines/{pid}/runs/latestPipelineRun"
                ),
                &[],
            ),
        )
        .await
        {
            Ok(latest) => latest,
            Err(e) => {
                // 单条流水线失败不拖垮整轮，但必须留痕（旧实现静默 continue）
                eprintln!("[poller] {pname}(#{pid}) 最新运行获取失败: {e}");
                failures += 1;
                continue;
            }
        };
        let rid = latest
            .get("pipelineRunId")
            .and_then(|x| x.as_i64())
            .unwrap_or(0);
        let status = latest
            .get("status")
            .and_then(|x| x.as_str())
            .unwrap_or_default()
            .to_string();
        if rid == 0 || status.is_empty() {
            continue;
        }
        let key = format!("{pid}:{rid}");
        let prev = seen.insert(key.clone(), status.clone());
        let was_active = matches!(prev.as_deref(), Some("RUNNING") | Some("WAITING"));
        let now_terminal = TERMINAL.contains(&status.as_str());
        if was_active && now_terminal && prev.as_deref() != Some(status.as_str()) {
            let payload = json!({
                "pipelineId": pid,
                "pipelineName": pname,
                "runId": rid,
                "status": status,
            });
            let _ = app.emit("pipeline-run-finished", payload);
            use tauri_plugin_notification::NotificationExt;
            let _ = app
                .notification()
                .builder()
                .title("nervd · 流水线完成")
                .body(format!("{pname} #{rid} → {status}"))
                .show();
        }
    }
    // 全部流水线都失败时上抛，触发退避，避免对故障网关做 60s 一次的无效轮询
    if queried > 0 && failures == queried {
        return Err(format!("{failures}/{queried} 条流水线的最新运行获取失败"));
    }
    Ok(())
}
