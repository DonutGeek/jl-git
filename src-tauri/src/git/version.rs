use serde::Serialize;
use std::path::PathBuf;
use std::process::Command;

use crate::error::AppError;

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitVersionResult {
    pub version: String,
    pub path: String,
}

/// 探测本机 Git 是否可用及版本（`git --version`，参数数组调用）
pub fn probe(executable: Option<&str>) -> Result<GitVersionResult, AppError> {
    let exe = match executable {
        Some(raw) if !raw.trim().is_empty() => raw.trim(),
        _ => "git",
    };

    let mut command = Command::new(exe);
    crate::process_cmd::configure_background_command(&mut command);
    let output = command
        .arg("--version")
        .output()
        .map_err(|error| AppError::git_not_found(error.to_string()))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::git_not_found(stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let version = stdout.lines().next().unwrap_or("").trim().to_string();
    if version.is_empty() {
        return Err(AppError::git_not_found("Git 版本输出为空"));
    }

    let path = resolve_git_path(exe).unwrap_or_else(|| exe.to_string());

    Ok(GitVersionResult { version, path })
}

fn resolve_git_path(exe: &str) -> Option<String> {
    if PathBuf::from(exe).is_absolute() {
        return Some(exe.to_string());
    }

    #[cfg(windows)]
    let which = "where";
    #[cfg(not(windows))]
    let which = "which";

    let mut command = Command::new(which);
    crate::process_cmd::configure_background_command(&mut command);
    let output = command.arg(exe).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let path = String::from_utf8_lossy(&output.stdout)
        .lines()
        .next()?
        .trim()
        .to_string();
    if path.is_empty() {
        None
    } else {
        Some(path)
    }
}
