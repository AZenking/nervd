//! nervd —— 以云效需求为维度的 CI/CD 桌面工作台

mod commands;
mod credentials;
mod jenkins;
mod poller;
mod yunxiao;

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::Manager;

pub struct AppStateInner {
    pub client: Mutex<Option<Arc<yunxiao::YunxiaoClient>>>,
    pub settings: Mutex<credentials::Settings>,
    pub jenkins_trigger_baselines: Mutex<HashMap<String, Vec<i64>>>,
}
pub type AppState = Arc<AppStateInner>;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let settings = credentials::load_settings(&app.handle());
            let client = credentials::load_pat()
                .and_then(|p| yunxiao::YunxiaoClient::new(&p).ok())
                .map(Arc::new);
            let inner: AppState = Arc::new(AppStateInner {
                client: Mutex::new(client),
                settings: Mutex::new(settings),
                jenkins_trigger_baselines: Mutex::new(HashMap::new()),
            });
            app.manage(inner.clone());
            poller::spawn(app.handle().clone(), inner);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::save_settings,
            commands::save_workitem_repos,
            commands::save_pat,
            commands::delete_pat,
            commands::check_connection,
            commands::list_projects,
            commands::list_workitems,
            commands::get_workitem,
            commands::list_workitem_comments,
            commands::update_workitem_status,
            commands::list_repos,
            commands::list_branches,
            commands::create_branch,
            commands::list_repository_commits,
            commands::list_merge_requests,
            commands::create_merge_request,
            commands::merge_merge_request,
            commands::list_pipelines,
            commands::list_pipeline_runs,
            commands::get_pipeline_run,
            commands::start_pipeline_run,
            commands::stop_pipeline_run,
            commands::get_job_logs,
            commands::save_jenkins_token,
            commands::delete_jenkins_token,
            commands::test_jenkins_connection,
            commands::get_jenkins_job,
            commands::get_repo_ci_snapshot,
            commands::trigger_repo_ci,
            commands::get_repo_ci_logs
        ])
        .run(tauri::generate_context!())
        .expect("error while running nervd");
}
