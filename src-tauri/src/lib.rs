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

#[cfg(target_os = "macos")]
fn setup_macos_menu(app: &tauri::AppHandle) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};

    let app_name = "nervd";

    // 1. App 菜单（关于 nervd / 设置 / 隐藏 / 退出）
    let app_submenu = Submenu::with_items(
        app,
        app_name,
        true,
        &[
            &MenuItem::with_id(app, "open_about", "关于 nervd", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "open_settings", "设置…", true, Some("CmdOrCtrl+,"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::services(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, Some("隐藏 nervd"))?,
            &PredefinedMenuItem::hide_others(app, Some("隐藏其他"))?,
            &PredefinedMenuItem::show_all(app, Some("显示全部"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, Some("退出 nervd"))?,
        ],
    )?;

    // 2. 编辑菜单（保障 macOS Webview 输入控件中 ⌘Z/⌘X/⌘C/⌘V/⌘A 全局可用）
    let edit_submenu = Submenu::with_items(
        app,
        "编辑",
        true,
        &[
            &PredefinedMenuItem::undo(app, Some("撤销"))?,
            &PredefinedMenuItem::redo(app, Some("重做"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, Some("剪切"))?,
            &PredefinedMenuItem::copy(app, Some("拷贝"))?,
            &PredefinedMenuItem::paste(app, Some("粘贴"))?,
            &PredefinedMenuItem::select_all(app, Some("全选"))?,
        ],
    )?;

    // 3. 视图菜单
    let view_submenu = Submenu::with_items(
        app,
        "视图",
        true,
        &[
            &MenuItem::with_id(app, "nav_overview", "总览", true, None::<&str>)?,
            &MenuItem::with_id(app, "nav_iteration", "当前迭代", true, None::<&str>)?,
            &MenuItem::with_id(app, "nav_integration", "集成分支", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "open_command", "命令面板…", true, Some("CmdOrCtrl+K"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::fullscreen(app, Some("切换全屏幕"))?,
        ],
    )?;

    // 4. 窗口菜单
    let window_submenu = Submenu::with_items(
        app,
        "窗口",
        true,
        &[
            &PredefinedMenuItem::minimize(app, Some("最小化"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, Some("关闭窗口"))?,
        ],
    )?;

    // 5. 帮助菜单
    let help_submenu = Submenu::with_items(
        app,
        "帮助",
        true,
        &[
            &MenuItem::with_id(app, "open_shortcuts", "键盘快捷键速查", true, Some("Shift+/"))?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "open_about_help", "关于 nervd", true, None::<&str>)?,
        ],
    )?;

    let menu = Menu::with_items(
        app,
        &[
            &app_submenu,
            &edit_submenu,
            &view_submenu,
            &window_submenu,
            &help_submenu,
        ],
    )?;

    app.set_menu(menu)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .on_menu_event(|app, event| {
            use tauri::Emitter;
            match event.id().as_ref() {
                "open_about" | "open_about_help" => {
                    let _ = app.emit("open-about", ());
                }
                "open_settings" => {
                    let _ = app.emit("open-settings", "about");
                }
                "open_command" => {
                    let _ = app.emit("open-command", ());
                }
                "open_shortcuts" => {
                    let _ = app.emit("open-shortcuts", ());
                }
                "nav_overview" => {
                    let _ = app.emit("navigate-view", "overview");
                }
                "nav_iteration" => {
                    let _ = app.emit("navigate-view", "iteration");
                }
                "nav_integration" => {
                    let _ = app.emit("navigate-view", "integration");
                }
                _ => {}
            }
        })
        .setup(|app| {
            #[cfg(target_os = "macos")]
            if let Err(e) = setup_macos_menu(&app.handle()) {
                eprintln!("[menu] failed to set macos menu: {e}");
            }

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
            commands::save_branch_rule_templates,
            commands::save_workitem_repo_branch_template,
            commands::save_repo_ci_binding,
            commands::save_pat,
            commands::delete_pat,
            commands::check_connection,
            commands::get_current_user,
            commands::list_projects,
            commands::list_iterations,
            commands::list_workitems,
            commands::get_workitem,
            commands::list_workitem_comments,
            commands::create_workitem_comment,
            commands::list_workitem_children,
            commands::get_workitem_workflow_statuses,
            commands::update_workitem,
            commands::list_workitem_types,
            commands::create_workitem_child,
            commands::proxy_workitem_file,
            commands::list_repos,
            commands::list_branches,
            commands::compare_branches,
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
            commands::list_jenkins_jobs,
            commands::get_jenkins_job_parameters,
            commands::trigger_jenkins_job,
            commands::get_repo_ci_snapshot,
            commands::trigger_repo_ci,
            commands::get_repo_ci_logs,
            commands::get_repo_ci_log_chunk,
            commands::get_ai_settings,
            commands::save_ai_settings,
            commands::save_ai_api_key,
            commands::delete_ai_api_key,
            commands::test_ai_connection,
            commands::ai_chat_completion,
            commands::check_for_updates,
            commands::download_and_install_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running nervd");
}
