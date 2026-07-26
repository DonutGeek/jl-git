use crate::error::AppError;
use crate::system::{self, OkResult, SystemAppInfo, SystemDiskSpace, SystemRuntimeStats};

#[tauri::command]
pub fn system_app_info() -> SystemAppInfo {
    system::app_info()
}

/// 本进程内存 / CPU / 运行时长 / 线程（设置「性能」实时区）
#[tauri::command]
pub fn system_runtime_stats() -> Result<SystemRuntimeStats, AppError> {
    system::runtime_stats()
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

/// 枚举本机可见磁盘卷（多盘符 / 多挂载）
#[tauri::command]
pub fn system_disk_volumes() -> Result<Vec<SystemDiskSpace>, AppError> {
    system::list_disk_volumes()
}

/// 打开系统终端并定位到指定目录（通常为当前仓库根）
#[tauri::command]
pub fn system_open_terminal(
    path: String,
    preference: Option<String>,
    custom_path: Option<String>,
) -> Result<OkResult, AppError> {
    system::open_terminal(
        &path,
        preference.as_deref(),
        custom_path.as_deref(),
    )
}

/// 在文件管理器中显示文件或目录
#[tauri::command]
pub fn system_reveal_in_file_manager(path: String) -> Result<OkResult, AppError> {
    system::reveal_in_file_manager(&path)
}

/// 用本机编辑器打开文件或目录
#[tauri::command]
pub fn system_open_in_editor(
    path: String,
    preference: Option<String>,
    custom_path: Option<String>,
) -> Result<OkResult, AppError> {
    system::open_in_editor(
        &path,
        preference.as_deref(),
        custom_path.as_deref(),
    )
}

/// 使用系统默认程序打开文件或目录
#[tauri::command]
pub fn system_open_with_default_app(path: String) -> Result<OkResult, AppError> {
    system::open_with_default_app(&path)
}

/// 写入文本文件（绝对路径；供导出等用户选定路径）
#[tauri::command]
pub fn system_write_text_file(path: String, contents: String) -> Result<OkResult, AppError> {
    system::write_text_file(&path, &contents)
}
