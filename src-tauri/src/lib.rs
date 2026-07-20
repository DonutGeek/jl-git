// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod commands;
mod db;
mod error;
mod git;
mod menu;
mod system;

use tauri::Manager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;
            let db_path = app_data_dir.join("jlgit.db");
            let pool = tauri::async_runtime::block_on(db::connect(&db_path))
                .map_err(|error| Box::new(error) as Box<dyn std::error::Error>)?;

            app.manage(pool);

            // 桌面端：中文原生菜单（macOS 菜单栏 File/Edit 等不会自动翻译）
            #[cfg(desktop)]
            menu::install_zh_cn_menu(app.handle())?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::project::project_list,
            commands::project::project_add,
            commands::project::project_touch_opened,
            commands::project::project_remove,
            commands::project::project_update,
            commands::project::project_pick_directory,
            commands::project::recent_list,
            commands::project::workspace_list,
            commands::project::workspace_create,
            commands::project::workspace_update,
            commands::project::workspace_delete,
            commands::project::workspace_reorder,
            commands::git_ops::git_status,
            commands::git_ops::git_identity,
            commands::git_ops::git_identity_global,
            commands::git_ops::git_identity_global_set,
            commands::git_ops::fs_list_dir,
            commands::git_ops::fs_file_size,
            commands::git_ops::git_branches,
            commands::git_ops::git_tags,
            commands::git_ops::git_tag_create,
            commands::git_ops::git_tag_delete,
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
            commands::git_ops::git_commit_file_diff,
            commands::git_ops::git_stage,
            commands::git_ops::git_unstage,
            commands::git_ops::git_stage_all,
            commands::git_ops::git_unstage_all,
            commands::git_ops::git_commit,
            commands::git_ops::git_fetch,
            commands::git_ops::git_pull,
            commands::git_ops::git_push,
            commands::git_ops::git_remotes,
            commands::git_ops::git_undo_commit,
            commands::git_ops::git_merge,
            commands::git_ops::git_repo_state,
            commands::git_ops::git_conflict_take,
            commands::git_ops::git_read_worktree_file,
            commands::git_ops::git_write_worktree_file,
            commands::git_ops::git_conflict_mark_resolved,
            commands::git_ops::git_checkout,
            commands::git_ops::git_branch_create,
            commands::git_ops::git_branch_delete,
            commands::git_ops::git_branch_rename,
            commands::system::system_app_info,
            commands::system::system_list_fonts,
            commands::system::system_disk_space,
            commands::system::system_open_terminal,
            commands::system::system_reveal_in_file_manager,
            commands::system::system_open_in_editor
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
