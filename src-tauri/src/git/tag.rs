use serde::Serialize;
use std::path::Path;
use std::time::Duration;

use crate::error::AppError;
use crate::git::{path::validate_git_ref, runner};

const PUSH_TIMEOUT: Duration = Duration::from_secs(180);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitTag {
    pub name: String,
    pub target: String,
    /// 注解标签为 tagger 时间；轻量标签为指向提交时间；无则空串
    pub authored_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

pub fn list_tags(repo_path: &Path) -> Result<Vec<GitTag>, AppError> {
    let output = runner::run_git(
        repo_path,
        &[
            "for-each-ref",
            "--format=%(refname:short)%00%(objectname)%00%(creatordate:iso-strict)%00%(contents:subject)",
            "refs/tags",
        ],
    )?;

    Ok(parse_tags(&output.stdout))
}

pub fn create_tag(
    repo_path: &Path,
    name: &str,
    message: Option<&str>,
    target: Option<&str>,
) -> Result<(), AppError> {
    validate_tag_name(repo_path, name)?;
    if let Some(target) = target {
        validate_git_ref(target)?;
    }

    let mut args = vec!["tag"];
    if let Some(message) = message.filter(|value| !value.trim().is_empty()) {
        args.extend(["-a", "-m", message]);
    }
    args.extend(["--", name]);
    if let Some(target) = target {
        args.push(target);
    }

    runner::run_git(repo_path, &args)?;
    Ok(())
}

pub fn delete_tag(repo_path: &Path, name: &str) -> Result<(), AppError> {
    validate_tag_name(repo_path, name)?;
    runner::run_git(repo_path, &["tag", "-d", "--", name])?;
    Ok(())
}

/** 是否存在本地标签 `refs/tags/<name>` */
pub fn tag_exists(repo_path: &Path, name: &str) -> Result<bool, AppError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Ok(false);
    }
    let full_ref = format!("refs/tags/{trimmed}");
    let output =
        runner::run_git_allow_nonzero(repo_path, &["show-ref", "--verify", "--quiet", &full_ref])?;
    match output.code {
        0 => Ok(true),
        1 => Ok(false),
        _ => Err(AppError::new("GIT", "检查标签失败").with_details(output.stderr)),
    }
}

pub fn push_tag(repo_path: &Path, remote: &str, name: &str) -> Result<(), AppError> {
    validate_git_ref(remote)?;
    validate_tag_name(repo_path, name)?;
    let refspec = format!("refs/tags/{name}");
    runner::run_git_timeout(
        repo_path,
        &[
            "-c",
            "protocol.version=2",
            "push",
            "--progress",
            remote,
            &refspec,
        ],
        PUSH_TIMEOUT,
    )?;
    Ok(())
}

fn validate_tag_name(repo_path: &Path, name: &str) -> Result<(), AppError> {
    let trimmed = name.trim();
    validate_git_ref(trimmed)?;
    let full_ref = format!("refs/tags/{trimmed}");
    let output = runner::run_git_allow_nonzero(
        repo_path,
        &["check-ref-format", "--allow-onelevel", &full_ref],
    )?;
    if output.code == 0 {
        Ok(())
    } else {
        Err(AppError::new("VALIDATION", "非法标签名称"))
    }
}

fn parse_tags(stdout: &str) -> Vec<GitTag> {
    stdout
        .lines()
        .filter_map(|line| {
            let mut fields = line.split('\0');
            let name = fields.next()?.trim();
            let target = fields.next()?.trim();
            if name.is_empty() || target.is_empty() {
                return None;
            }
            let authored_at = fields.next().map(str::trim).unwrap_or("").to_string();
            let message = fields
                .next()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string);

            Some(GitTag {
                name: name.to_string(),
                target: target.to_string(),
                authored_at,
                message,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::parse_tags;

    #[test]
    fn parses_annotated_and_lightweight_tags() {
        let tags = parse_tags(
            "v1.0.0\0abc123\02026-07-01T10:00:00+08:00\0Release one\nv1.1.0\0def456\0\0\n",
        );

        assert_eq!(tags.len(), 2);
        assert_eq!(tags[0].name, "v1.0.0");
        assert_eq!(tags[0].authored_at, "2026-07-01T10:00:00+08:00");
        assert_eq!(tags[0].message.as_deref(), Some("Release one"));
        assert_eq!(tags[1].authored_at, "");
        assert_eq!(tags[1].message, None);
    }
}
