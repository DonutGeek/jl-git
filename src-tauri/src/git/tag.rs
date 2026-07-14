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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

pub fn list_tags(repo_path: &Path) -> Result<Vec<GitTag>, AppError> {
    let output = runner::run_git(
        repo_path,
        &[
            "for-each-ref",
            "--format=%(refname:short)%00%(objectname)%00%(contents:subject)",
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
            let message = fields
                .next()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string);

            Some(GitTag {
                name: name.to_string(),
                target: target.to_string(),
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
        let tags = parse_tags("v1.0.0\0abc123\0Release one\nv1.1.0\0def456\0\n");

        assert_eq!(tags.len(), 2);
        assert_eq!(tags[0].name, "v1.0.0");
        assert_eq!(tags[0].message.as_deref(), Some("Release one"));
        assert_eq!(tags[1].message, None);
    }
}
