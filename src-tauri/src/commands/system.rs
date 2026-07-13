use crate::error::AppError;
use crate::system::{self, OkResult, SystemAppInfo, SystemDiskSpace};

#[tauri::command]
pub fn system_app_info() -> SystemAppInfo {
    system::app_info()
}

/// 列出本机字体族，供设置里客户端 / 编辑器字体下拉使用
#[tauri::command]
pub fn system_list_fonts() -> Result<Vec<String>, AppError> {
    system::list_fonts()
}

#[tauri::command]
pub fn system_disk_space(path: Option<String>) -> Result<SystemDiskSpace, AppError> {
    system::disk_space(path.as_deref())
}

/// 打开系统终端并定位到指定目录（通常为当前仓库根）
#[tauri::command]
pub fn system_open_terminal(path: String) -> Result<OkResult, AppError> {
    system::open_terminal(&path)
}

/// 在文件管理器中打开目录
#[tauri::command]
pub fn system_reveal_in_file_manager(path: String) -> Result<OkResult, AppError> {
    system::reveal_in_file_manager(&path)
}

/// 用本机编辑器打开目录
#[tauri::command]
pub fn system_open_in_editor(path: String) -> Result<OkResult, AppError> {
    system::open_in_editor(&path)
}
