use crate::error::AppError;
use crate::git::runner;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

pub fn normalize_existing_dir(path: &str) -> Result<PathBuf, AppError> {
    let path = normalize_existing_path(path)?;

    if !path.is_dir() {
        return Err(AppError::new("INVALID_PATH", "路径不是目录"));
    }

    Ok(path)
}

/// 规范化已存在的文件或目录路径
pub fn normalize_existing_path(path: &str) -> Result<PathBuf, AppError> {
    let path = PathBuf::from(path);

    if !path.exists() {
        return Err(AppError::new("INVALID_PATH", "路径不存在"));
    }

    std::fs::canonicalize(&path).map_err(|error| {
        AppError::new("INVALID_PATH", "无法规范化路径").with_details(error.to_string())
    })
}

pub fn require_git_toplevel(path: &Path) -> Result<PathBuf, AppError> {
    let output = runner::run_git_allow_nonzero(path, &["rev-parse", "--show-toplevel"])?;

    if output.code != 0 {
        return Err(AppError::new("NOT_A_REPO", "不是 Git 仓库").with_details(output.stderr));
    }

    let toplevel = output.stdout.trim();
    if toplevel.is_empty() {
        return Err(AppError::new("NOT_A_REPO", "不是 Git 仓库"));
    }

    Ok(PathBuf::from(toplevel))
}

pub fn validate_repo_relative_paths(paths: &[String]) -> Result<(), AppError> {
    for path in paths {
        if path.is_empty() || path.contains('\0') {
            return Err(AppError::new("VALIDATION", "非法路径"));
        }

        let relative_path = Path::new(path);
        if relative_path.is_absolute() || path.split(['/', '\\']).any(|segment| segment == "..") {
            return Err(AppError::new(
                "VALIDATION",
                "路径必须相对仓库根且不得包含 ..",
            ));
        }
    }

    Ok(())
}

/// 解析工作区内已存在的文件，允许指向仓库内文件的符号链接，但拒绝越界链接。
pub fn resolve_worktree_file(
    repo_path: &Path,
    relative: &str,
) -> Result<Option<PathBuf>, AppError> {
    validate_repo_relative_paths(&[relative.to_string()])?;
    let candidate = repo_path.join(relative);

    match std::fs::symlink_metadata(&candidate) {
        Ok(_) => {}
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
        Err(error) => {
            return Err(
                AppError::new("INVALID_PATH", "无法读取工作区路径").with_details(error.to_string())
            );
        }
    }

    let repo_canonical = std::fs::canonicalize(repo_path).map_err(|error| {
        AppError::new("INVALID_PATH", "无法规范化仓库路径").with_details(error.to_string())
    })?;
    let target = std::fs::canonicalize(&candidate).map_err(|error| {
        AppError::new("INVALID_PATH", "无法规范化工作区路径").with_details(error.to_string())
    })?;

    if target == repo_canonical || !target.starts_with(&repo_canonical) {
        return Err(AppError::new(
            "INVALID_PATH",
            "工作区文件指向仓库外部，已拒绝读取",
        ));
    }
    if !target.is_file() {
        return Ok(None);
    }

    Ok(Some(target))
}

pub fn validate_git_ref(name: &str) -> Result<(), AppError> {
    if name.trim().is_empty() || name.starts_with('-') || name.contains('\0') {
        return Err(AppError::new("VALIDATION", "非法 Git 引用"));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_parent_segment() {
        assert!(validate_repo_relative_paths(&["a/../b".into()]).is_err());
    }

    #[test]
    fn accepts_normal_relative() {
        assert!(validate_repo_relative_paths(&["src/App.tsx".into()]).is_ok());
    }

    #[cfg(unix)]
    #[test]
    fn rejects_worktree_symlink_outside_repo() {
        use std::os::unix::fs::symlink;

        let root = std::env::temp_dir().join(format!(
            "jlgit-path-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let repo = root.join("repo");
        let outside = root.join("outside.txt");
        std::fs::create_dir_all(&repo).unwrap();
        std::fs::write(&outside, "secret").unwrap();
        symlink(&outside, repo.join("link.txt")).unwrap();

        assert!(resolve_worktree_file(&repo, "link.txt").is_err());

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_invalid_git_refs() {
        assert!(validate_git_ref("   ").is_err());
        assert!(validate_git_ref("-main").is_err());
        assert!(validate_git_ref("main\0next").is_err());
    }

    #[test]
    fn accepts_normal_git_ref() {
        assert!(validate_git_ref("feature/task-2").is_ok());
    }
}
