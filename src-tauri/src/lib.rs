//! JLGit 桌面端入口：挂载插件、启动内嵌 Axum 服务、注册 Command。
//! 不要在这里堆业务；分层是 server → handlers → services → repositories。

mod commands;
mod error;
mod git;
mod handlers;
#[cfg(target_os = "macos")]
mod menu;
mod models;
mod process_cmd;
mod repositories;
mod server;
mod services;
mod state;
mod system;
mod system_browsers;
#[cfg(windows)]
mod system_windows;

use serde::Serialize;
use tauri::{Manager, RunEvent};

use crate::error::AppError;
use crate::server::ServerHandle;
use crate::state::AppState;

/// 脚手架遗留，前端未调用；保留以免旧 capability 清单对不上。
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerInfo {
    pub port: u16,
    pub token: String,
    pub base_url: String,
}

/// 前端引导阶段唯一需要的 Command：拿到本地服务地址与一次性凭据。
#[tauri::command]
fn server_info(handle: tauri::State<'_, ServerHandle>) -> Result<ServerInfo, AppError> {
    Ok(ServerInfo {
        port: handle.port,
        token: handle.token.clone(),
        base_url: format!("http://127.0.0.1:{}", handle.port),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .setup(|app| {
            #[cfg(desktop)]
            {
                // 开机自启：macOS 使用 LaunchAgent
                app.handle().plugin(tauri_plugin_autostart::init(
                    tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                    None,
                ))?;
            }

            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;

            let state = AppState::new(app_data_dir, server::generate_token());
            // 已配通过数据库时静默恢复连接池；未配通则由向导接管
            let restore_state = state.clone();
            tauri::async_runtime::spawn(async move {
                services::setup::restore_saved_pool(&restore_state).await;
            });

            // bind 是同步的，失败会在此变成启动错误而非后台静默失败
            let handle = server::start(state.clone())
                .map_err(|error| Box::new(error) as Box<dyn std::error::Error>)?;
            app.manage(handle);
            app.manage(state);

            // macOS 保留系统应用菜单；Windows / Linux 不挂应用菜单，
            // 仅保留原生标题栏与系统窗口按钮。
            #[cfg(target_os = "macos")]
            menu::install_zh_cn_menu(app.handle())?;
            #[cfg(any(target_os = "windows", target_os = "linux"))]
            app.remove_menu()?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            server_info,
            commands::project::project_list,
            commands::project::project_add,
            commands::project::project_check_uniqueness,
            commands::project::project_touch_opened,
            commands::project::project_remove,
            commands::project::project_update,
            commands::project::project_profile_snapshot,
            commands::project::project_pick_directory,
            commands::project::recent_list,
            commands::project::recent_remove,
            commands::project::workspace_list,
            commands::project::workspace_tree,
            commands::project::project_catalog_tree,
            commands::project::workspace_create,
            commands::project::workspace_update,
            commands::project::workspace_delete,
            commands::project::workspace_reorder,
            commands::chat::chat_list_conversations,
            commands::chat::chat_upsert_conversation,
            commands::chat::chat_delete_conversation,
            commands::chat::chat_reorder_conversations,
            commands::app_data::app_data_paths,
            commands::app_data::app_data_usage,
            commands::app_data::app_data_reveal,
            commands::app_data::app_data_clear,
            commands::app_data::app_data_export,
            commands::app_data::app_data_import,
            commands::git_ops::git_status,
            commands::git_ops::git_identity,
            commands::git_ops::git_identity_global,
            commands::git_ops::git_identity_global_set,
            commands::git_ops::fs_list_dir,
            commands::git_ops::fs_file_size,
            commands::git_ops::fs_remove,
            commands::git_ops::fs_rename,
            commands::git_ops::fs_create,
            commands::git_ops::git_branches,
            commands::git_ops::git_tags,
            commands::git_ops::git_tag_create,
            commands::git_ops::git_tag_delete,
            commands::git_ops::git_tag_push,
            commands::git_ops::git_tag_delete_remote,
            commands::git_ops::git_tags_remote,
            commands::git_ops::git_tag_fetch,
            commands::git_ops::git_log,
            commands::git_ops::git_blame,
            commands::git_ops::git_show,
            commands::git_ops::git_commit_message,
            commands::git_ops::git_ls_tree,
            commands::git_ops::git_commit_containing_branches,
            commands::git_ops::git_commit_change_size,
            commands::git_ops::git_diff,
            commands::git_ops::git_file_media,
            commands::git_ops::git_branch_compare,
            commands::git_ops::git_branch_file_diff,
            commands::git_ops::git_staged_diff,
            commands::git_ops::git_commit_patch_diff,
            commands::git_ops::git_commit_file_diff,
            commands::git_ops::git_stage,
            commands::git_ops::git_unstage,
            commands::git_ops::git_stage_all,
            commands::git_ops::git_unstage_all,
            commands::git_ops::git_discard,
            commands::git_ops::git_commit,
            commands::git_ops::git_amend_message,
            commands::git_ops::git_stash_list,
            commands::git_ops::git_stash_apply,
            commands::git_ops::git_restore_lint_staged_backup,
            commands::git_ops::git_set_extra_path,
            commands::git_ops::git_probe_hook_toolchain,
            commands::git_ops::git_discover_node_bin,
            commands::git_ops::git_clone,
            commands::git_ops::git_fetch,
            commands::git_ops::git_pull,
            commands::git_ops::git_push,
            commands::git_ops::git_remotes,
            commands::git_ops::git_undo_commit,
            commands::git_ops::git_merge,
            commands::git_ops::git_repo_state,
            commands::git_ops::git_abort_operation,
            commands::git_ops::git_conflict_take,
            commands::git_ops::git_read_worktree_file,
            commands::git_ops::git_grep,
            commands::git_ops::git_write_worktree_file,
            commands::git_ops::git_conflict_mark_resolved,
            commands::git_ops::git_checkout,
            commands::git_ops::git_branch_create,
            commands::git_ops::git_branch_delete,
            commands::git_ops::git_branch_rename,
            commands::git_ops::git_version,
            commands::system::system_app_info,
            commands::system::system_runtime_stats,
            commands::system::system_list_fonts,
            commands::system::system_disk_space,
            commands::system::system_disk_volumes,
            commands::system::system_open_terminal,
            commands::system::system_reveal_in_file_manager,
            commands::system::system_open_in_editor,
            commands::system::system_open_with_default_app,
            commands::system::system_write_text_file,
            commands::system::system_read_text_file,
            commands::system::system_list_browsers,
            commands::system::system_open_url,
            commands::document::document_extract_pdf_text,
            commands::ssh_keys::ssh_key_generate,
            commands::ssh_keys::ssh_key_change_passphrase,
            commands::ssh_keys::ssh_key_delete,
            commands::ssh_keys::ssh_key_scan_local,
            commands::ssh_keys::ssh_key_read_public
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app, event| match event {
        // 退出请求阶段发关闭信号，让 Axum 停止接收新连接
        RunEvent::ExitRequested { .. } => {
            if let Some(handle) = app.try_state::<ServerHandle>() {
                handle.shutdown();
            }
        }
        // 真正退出前带超时等待收尾，避免端口残留
        RunEvent::Exit => {
            if let Some(handle) = app.try_state::<ServerHandle>() {
                handle.shutdown();
                handle.wait_for_exit();
            }
        }
        _ => {}
    });
}
