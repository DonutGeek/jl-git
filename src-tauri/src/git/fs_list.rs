use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::error::AppError;
use crate::git::path::validate_repo_relative_paths;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FsEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FsListResult {
    pub entries: Vec<FsEntry>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FsFileSizeResult {
    /// 字节数；无法取得时为 null
    pub size: Option<u64>,
}

/// 列出仓库内相对目录的一层子项（不含 `.` / `..`，跳过 `.git`）
pub fn list_dir(repo_root: &Path, relative: &str) -> Result<FsListResult, AppError> {
    let target = resolve_list_target(repo_root, relative)?;

    let mut entries = Vec::new();

    let read_dir = fs::read_dir(&target).map_err(|error| {
        AppError::new("INVALID_PATH", "无法读取目录").with_details(error.to_string())
    })?;

    for item in read_dir {
        let item = item.map_err(|error| {
            AppError::new("INVALID_PATH", "无法读取目录项").with_details(error.to_string())
        })?;

        let name = item.file_name().to_string_lossy().to_string();
        if name == ".git" || name == "." || name == ".." {
            continue;
        }

        let file_type = item.file_type().map_err(|error| {
            AppError::new("INVALID_PATH", "无法判断文件类型").with_details(error.to_string())
        })?;

        let is_dir = file_type.is_dir();
        let path = if relative.is_empty() {
            name.clone()
        } else {
            format!("{relative}/{name}")
        };

        entries.push(FsEntry {
            name,
            path,
            is_dir,
        });
    }

    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(FsListResult { entries })
}

/// 工作区文件大小；已删除则回退 HEAD / 暂存区 blob 大小
pub fn file_size(repo_root: &Path, relative: &str) -> Result<FsFileSizeResult, AppError> {
    let relative = relative.trim();
    if relative.is_empty() {
        return Err(AppError::new("VALIDATION", "缺少文件路径"));
    }
    validate_repo_relative_paths(&[relative.to_string()])?;

    let abs = repo_root.join(relative);
    if abs.is_file() {
        let meta = fs::metadata(&abs).map_err(|error| {
            AppError::new("INTERNAL", "无法读取文件大小").with_details(error.to_string())
        })?;
        return Ok(FsFileSizeResult {
            size: Some(meta.len()),
        });
    }

    if let Some(size) = blob_size(repo_root, &format!("HEAD:{relative}"))? {
        return Ok(FsFileSizeResult { size: Some(size) });
    }
    if let Some(size) = blob_size(repo_root, &format!(":{relative}"))? {
        return Ok(FsFileSizeResult { size: Some(size) });
    }

    Ok(FsFileSizeResult { size: None })
}

fn blob_size(repo_root: &Path, spec: &str) -> Result<Option<u64>, AppError> {
    let mut command = Command::new("git");
    crate::process_cmd::configure_background_command(&mut command);
    let output = command
        .args(["cat-file", "-s", spec])
        .current_dir(repo_root)
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()
        .map_err(|error| {
            AppError::new("GIT_FAILED", "无法读取 blob 大小").with_details(error.to_string())
        })?;

    if !output.status.success() {
        return Ok(None);
    }

    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(text.parse::<u64>().ok())
}

fn resolve_list_target(repo_root: &Path, relative: &str) -> Result<PathBuf, AppError> {
    if relative.is_empty() {
        return Ok(repo_root.to_path_buf());
    }

    validate_repo_relative_paths(&[relative.to_string()])?;

    let candidate = repo_root.join(relative);
    let canonical = fs::canonicalize(&candidate).map_err(|error| {
        AppError::new("INVALID_PATH", "路径不存在").with_details(error.to_string())
    })?;

    let repo_canonical = fs::canonicalize(repo_root).map_err(|error| {
        AppError::new("INVALID_PATH", "无法规范化仓库路径").with_details(error.to_string())
    })?;

    if !canonical.starts_with(&repo_canonical) {
        return Err(AppError::new("INVALID_PATH", "路径超出仓库根目录"));
    }

    if !canonical.is_dir() {
        return Err(AppError::new("INVALID_PATH", "路径不是目录"));
    }

    Ok(canonical)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn make_temp_dir() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("jlgit-fs-list-{nanos}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn lists_root_and_skips_git() {
        let dir = make_temp_dir();
        fs::create_dir(dir.join(".git")).unwrap();
        fs::create_dir(dir.join("src")).unwrap();
        fs::write(dir.join("README.md"), "hi").unwrap();

        let result = list_dir(&dir, "").unwrap();
        assert!(result.entries.iter().any(|e| e.name == "README.md"));
        assert!(result.entries.iter().any(|e| e.name == "src" && e.is_dir));
        assert!(!result.entries.iter().any(|e| e.name == ".git"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rejects_path_escape() {
        let dir = make_temp_dir();
        assert!(list_dir(&dir, "../outside").is_err());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn reads_worktree_file_size() {
        let dir = make_temp_dir();
        fs::write(dir.join("a.txt"), "hello").unwrap();
        let result = file_size(&dir, "a.txt").unwrap();
        assert_eq!(result.size, Some(5));
        let _ = fs::remove_dir_all(&dir);
    }
}
