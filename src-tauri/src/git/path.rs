use crate::error::AppError;
use crate::git::runner;
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
