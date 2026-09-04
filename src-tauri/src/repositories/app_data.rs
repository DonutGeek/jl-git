//! 应用数据目录访问：Store 文件重置、体积统计、在文件管理器中定位。

use std::fs;
use std::path::Path;
use std::process::Command;

use crate::error::AppError;

pub const STORE_AI: &str = "ai-secrets.json";
pub const STORE_GIT: &str = "git-accounts.json";
/// 简历插件联系信息 Store（多仓鲸灵）
pub const STORE_AGENT_IDENTITY: &str = "agent-identity.json";
/// 应用内 SSH 密钥登记（不含 ~/.ssh 系统密钥文件本身）
pub const STORE_SSH_KEYS: &str = "ssh-keys.json";
/// 插件/技能卸载偏好
pub const STORE_AGENT_PLUGINS: &str = "agent-plugins.json";
/// 旧版文件名，按顺序保留兼容（清理时一并处理）
pub const STORE_AGENT_IDENTITY_LEGACY: [&str; 2] = ["jinglv.json", "resume-helper.json"];

/// 删除文件而非写空对象，避免前端 LazyStore 内存态与磁盘不一致后又被 save 写回。
pub fn reset_store_file(app_data_dir: &Path, file_name: &str) -> Result<(), AppError> {
    let path = app_data_dir.join(file_name);
    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => {
            Err(AppError::new("IO", format!("无法重置 {file_name}"))
                .with_details(error.to_string()))
        }
    }
}

pub fn remove_legacy_identity_files(app_data_dir: &Path) {
    for legacy in STORE_AGENT_IDENTITY_LEGACY {
        let _ = fs::remove_file(app_data_dir.join(legacy));
    }
}

/// 递归统计目录占用（设置「性能」低频刷新）
pub fn dir_total_bytes(path: &Path) -> std::io::Result<u64> {
    let meta = fs::symlink_metadata(path)?;
    if meta.file_type().is_symlink() {
        return Ok(0);
    }
    if meta.is_file() {
        return Ok(meta.len());
    }
    if !meta.is_dir() {
        return Ok(0);
    }
    let mut total = 0u64;
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        total = total.saturating_add(dir_total_bytes(&entry.path())?);
    }
    Ok(total)
}

pub fn reveal_path(path: &Path) -> Result<(), AppError> {
    #[cfg(target_os = "macos")]
    {
        let mut cmd = Command::new("open");
        if path.is_file() {
            cmd.arg("-R");
        }
        let status = cmd.arg(path).status().map_err(|error| {
            AppError::new("INTERNAL", "无法打开访达").with_details(error.to_string())
        })?;
        if !status.success() {
            return Err(AppError::new("INTERNAL", "打开访达失败"));
        }
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new("explorer");
        if path.is_file() {
            command.arg(format!("/select,{}", path.to_string_lossy()));
        } else {
            command.arg(path);
        }
        command.spawn().map_err(|error| {
            AppError::new("INTERNAL", "无法打开资源管理器").with_details(error.to_string())
        })?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let open_target = if path.is_file() {
            path.parent().unwrap_or(path)
        } else {
            path
        };
        let status = Command::new("xdg-open")
            .arg(open_target)
            .status()
            .map_err(|error| {
                AppError::new("INTERNAL", "无法打开文件管理器").with_details(error.to_string())
            })?;
        if !status.success() {
            return Err(AppError::new("INTERNAL", "打开文件管理器失败"));
        }
        return Ok(());
    }

    #[allow(unreachable_code)]
    Err(AppError::new("INTERNAL", "当前平台不支持打开文件管理器"))
}
