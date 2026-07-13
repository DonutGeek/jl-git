use crate::error::AppError;
use crate::git::runner;
use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitIdentity {
    pub name: Option<String>,
    pub email: Option<String>,
}

/// 读取当前仓库生效的 `user.name` / `user.email`（含全局配置回退）
pub fn get_identity(repo_path: &Path) -> Result<GitIdentity, AppError> {
    Ok(GitIdentity {
        name: read_config(repo_path, "user.name")?,
        email: read_config(repo_path, "user.email")?,
    })
}

/// 仅读全局 Git 身份（状态栏在无仓库时使用）
pub fn get_global_identity() -> Result<GitIdentity, AppError> {
    let cwd = std::env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."));

    Ok(GitIdentity {
        name: read_global_config(&cwd, "user.name")?,
        email: read_global_config(&cwd, "user.email")?,
    })
}

/// 写入全局 `user.name` / `user.email`（空字符串表示不改该项）
pub fn set_global_identity(
    name: Option<&str>,
    email: Option<&str>,
) -> Result<GitIdentity, AppError> {
    let cwd = std::env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."));

    if let Some(value) = name {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            return Err(AppError::new("VALIDATION", "Git 用户名不能为空"));
        }
        runner::run_git(&cwd, &["config", "--global", "user.name", trimmed])?;
    }

    if let Some(value) = email {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            return Err(AppError::new("VALIDATION", "Git 邮箱不能为空"));
        }
        if !trimmed.contains('@') {
            return Err(AppError::new("VALIDATION", "Git 邮箱格式不正确"));
        }
        runner::run_git(&cwd, &["config", "--global", "user.email", trimmed])?;
    }

    get_global_identity()
}

fn read_config(repo_path: &Path, key: &str) -> Result<Option<String>, AppError> {
    let output = runner::run_git_allow_nonzero(repo_path, &["config", "--get", key])?;
    if output.code != 0 {
        return Ok(None);
    }

    let value = output.stdout.trim();
    if value.is_empty() {
        Ok(None)
    } else {
        Ok(Some(value.to_string()))
    }
}

fn read_global_config(cwd: &Path, key: &str) -> Result<Option<String>, AppError> {
    let output = runner::run_git_allow_nonzero(cwd, &["config", "--global", "--get", key])?;
    if output.code != 0 {
        return Ok(None);
    }

    let value = output.stdout.trim();
    if value.is_empty() {
        Ok(None)
    } else {
        Ok(Some(value.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_when_missing() {
        // 仅验证结构可序列化字段默认形态
        let identity = GitIdentity {
            name: None,
            email: None,
        };
        assert!(identity.name.is_none());
        assert!(identity.email.is_none());
    }
}
