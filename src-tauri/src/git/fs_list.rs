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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FsRenameResult {
    /// 重命名后的仓库相对路径（正斜杠）
    pub path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FsCreateResult {
    /// 新建后的仓库相对路径（正斜杠）
    pub path: String,
    pub is_dir: bool,
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

        entries.push(FsEntry { name, path, is_dir });
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

/// 删除仓库内相对路径（文件或目录；目录递归删除）
pub fn remove(repo_root: &Path, relative: &str) -> Result<(), AppError> {
    let relative = normalize_relative(relative)?;
    let target = resolve_existing_under_repo(repo_root, &relative)?;
    reject_git_meta(repo_root, &target)?;

    if target.is_dir() {
        fs::remove_dir_all(&target).map_err(|error| {
            AppError::new("FS_FAILED", "无法删除目录").with_details(error.to_string())
        })?;
    } else {
        fs::remove_file(&target).map_err(|error| {
            AppError::new("FS_FAILED", "无法删除文件").with_details(error.to_string())
        })?;
    }

    Ok(())
}

/// 在父目录下新建空目录或空文件（`name` 仅为文件名）
pub fn create(
    repo_root: &Path,
    parent: &str,
    name: &str,
    is_dir: bool,
) -> Result<FsCreateResult, AppError> {
    let name = validate_basename(name)?;
    let parent_rel = normalize_parent(parent)?;
    let parent_abs = resolve_parent_dir(repo_root, &parent_rel)?;
    reject_git_meta(repo_root, &parent_abs)?;

    let target = parent_abs.join(&name);
    ensure_under_repo(repo_root, &target)?;

    if target.exists() {
        return Err(AppError::new("FS_EXISTS", "目标名称已存在"));
    }

    if is_dir {
        fs::create_dir(&target).map_err(|error| {
            AppError::new("FS_FAILED", "无法创建目录").with_details(error.to_string())
        })?;
    } else {
        fs::File::create(&target).map_err(|error| {
            AppError::new("FS_FAILED", "无法创建文件").with_details(error.to_string())
        })?;
    }

    let path = if parent_rel.is_empty() {
        name
    } else {
        format!("{parent_rel}/{name}")
    };

    Ok(FsCreateResult { path, is_dir })
}

/// 在同一父目录下重命名（`new_name` 仅为文件名，不含路径分隔符）
pub fn rename(repo_root: &Path, from: &str, new_name: &str) -> Result<FsRenameResult, AppError> {
    let from = normalize_relative(from)?;
    let new_name = validate_basename(new_name)?;
    let from_abs = resolve_existing_under_repo(repo_root, &from)?;
    reject_git_meta(repo_root, &from_abs)?;

    let parent = from_abs
        .parent()
        .ok_or_else(|| AppError::new("INVALID_PATH", "无法解析父目录"))?;
    let to_abs = parent.join(&new_name);
    ensure_under_repo(repo_root, &to_abs)?;

    if to_abs.exists() {
        return Err(AppError::new("FS_EXISTS", "目标名称已存在"));
    }

    fs::rename(&from_abs, &to_abs).map_err(|error| {
        AppError::new("FS_FAILED", "无法重命名").with_details(error.to_string())
    })?;

    let parent_rel = parent_relative(&from);
    let path = if parent_rel.is_empty() {
        new_name
    } else {
        format!("{parent_rel}/{new_name}")
    };

    Ok(FsRenameResult { path })
}

fn normalize_relative(relative: &str) -> Result<String, AppError> {
    let relative = relative.trim().replace('\\', "/");
    if relative.is_empty() {
        return Err(AppError::new("VALIDATION", "缺少路径"));
    }
    validate_repo_relative_paths(&[relative.clone()])?;
    if relative == ".git" || relative.starts_with(".git/") {
        return Err(AppError::new("VALIDATION", "不能操作 .git"));
    }
    Ok(relative)
}

/// 父目录相对路径；空字符串表示仓库根
fn normalize_parent(parent: &str) -> Result<String, AppError> {
    let parent = parent.trim().replace('\\', "/");
    if parent.is_empty() {
        return Ok(String::new());
    }
    normalize_relative(&parent)
}

fn resolve_parent_dir(repo_root: &Path, parent_rel: &str) -> Result<PathBuf, AppError> {
    if parent_rel.is_empty() {
        return fs::canonicalize(repo_root).map_err(|error| {
            AppError::new("INVALID_PATH", "无法规范化仓库路径").with_details(error.to_string())
        });
    }

    let parent_abs = resolve_existing_under_repo(repo_root, parent_rel)?;
    if !parent_abs.is_dir() {
        return Err(AppError::new("INVALID_PATH", "父路径不是目录"));
    }
    Ok(parent_abs)
}

fn validate_basename(name: &str) -> Result<String, AppError> {
    let name = name.trim();
    if name.is_empty() || name.contains('\0') {
        return Err(AppError::new("VALIDATION", "非法文件名"));
    }
    if name == "." || name == ".." || name.contains('/') || name.contains('\\') {
        return Err(AppError::new("VALIDATION", "文件名不能包含路径"));
    }
    if name == ".git" {
        return Err(AppError::new("VALIDATION", "不能使用保留名 .git"));
    }
    Ok(name.to_string())
}

fn parent_relative(relative: &str) -> String {
    match relative.rsplit_once('/') {
        Some((parent, _)) => parent.to_string(),
        None => String::new(),
    }
}

fn resolve_existing_under_repo(repo_root: &Path, relative: &str) -> Result<PathBuf, AppError> {
    let candidate = repo_root.join(relative);
    let canonical = fs::canonicalize(&candidate).map_err(|error| {
        AppError::new("INVALID_PATH", "路径不存在").with_details(error.to_string())
    })?;
    ensure_under_repo(repo_root, &canonical)?;
    Ok(canonical)
}

fn ensure_under_repo(repo_root: &Path, path: &Path) -> Result<(), AppError> {
    let repo_canonical = fs::canonicalize(repo_root).map_err(|error| {
        AppError::new("INVALID_PATH", "无法规范化仓库路径").with_details(error.to_string())
    })?;

    // 目标可能尚不存在（重命名目标）：用 canonicalize(parent) + 文件名判断
    let check = if path.exists() {
        fs::canonicalize(path).map_err(|error| {
            AppError::new("INVALID_PATH", "无法规范化路径").with_details(error.to_string())
        })?
    } else {
        let parent = path
            .parent()
            .ok_or_else(|| AppError::new("INVALID_PATH", "无法解析父目录"))?;
        let parent_canonical = fs::canonicalize(parent).map_err(|error| {
            AppError::new("INVALID_PATH", "无法规范化父目录").with_details(error.to_string())
        })?;
        let name = path
            .file_name()
            .ok_or_else(|| AppError::new("INVALID_PATH", "非法路径"))?;
        parent_canonical.join(name)
    };

    if !check.starts_with(&repo_canonical) || check == repo_canonical {
        return Err(AppError::new("INVALID_PATH", "路径超出仓库根目录"));
    }

    Ok(())
}

fn reject_git_meta(repo_root: &Path, target: &Path) -> Result<(), AppError> {
    let repo_canonical = fs::canonicalize(repo_root).map_err(|error| {
        AppError::new("INVALID_PATH", "无法规范化仓库路径").with_details(error.to_string())
    })?;
    let git_dir = repo_canonical.join(".git");
    if target == git_dir || target.starts_with(&git_dir) {
        return Err(AppError::new("VALIDATION", "不能操作 .git"));
    }
    Ok(())
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
        // 并行测试可能撞同一纳秒；追加线程 id 区分
        let dir = std::env::temp_dir().join(format!(
            "jlgit-fs-list-{nanos}-{:?}",
            std::thread::current().id()
        ));
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

    #[test]
    fn renames_and_removes_file() {
        let dir = make_temp_dir();
        fs::write(dir.join("a.txt"), "hi").unwrap();
        let renamed = rename(&dir, "a.txt", "b.txt").unwrap();
        assert_eq!(renamed.path, "b.txt");
        assert!(!dir.join("a.txt").exists());
        assert!(dir.join("b.txt").exists());
        remove(&dir, "b.txt").unwrap();
        assert!(!dir.join("b.txt").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rejects_rename_to_path_segment() {
        let dir = make_temp_dir();
        fs::write(dir.join("a.txt"), "hi").unwrap();
        assert!(rename(&dir, "a.txt", "x/y").is_err());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn creates_empty_dir_and_file() {
        let dir = make_temp_dir();
        fs::create_dir(dir.join("src")).unwrap();
        let folder = create(&dir, "src", "empty", true).unwrap();
        assert_eq!(folder.path, "src/empty");
        assert!(dir.join("src/empty").is_dir());
        let file = create(&dir, "src", "new.txt", false).unwrap();
        assert_eq!(file.path, "src/new.txt");
        assert!(dir.join("src/new.txt").is_file());
        let _ = fs::remove_dir_all(&dir);
    }
}
