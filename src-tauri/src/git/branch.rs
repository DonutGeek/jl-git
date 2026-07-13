use serde::Serialize;
use std::path::Path;

use crate::error::AppError;
use crate::git::runner;

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranch {
    pub name: String,
    pub is_current: bool,
    pub is_remote: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub upstream: Option<String>,
}

pub fn list_branches(repo_path: &Path, include_remote: bool) -> Result<Vec<GitBranch>, AppError> {
    let local_output = runner::run_git(
        repo_path,
        &[
            "for-each-ref",
            "--format=%(refname:short)%00%(HEAD)%00%(upstream:short)",
            "refs/heads",
        ],
    )?;

    let mut branches = parse_branches(&local_output.stdout);
    if include_remote {
        let remote_output = runner::run_git(
            repo_path,
            &[
                "for-each-ref",
                "--format=%(refname:short)%00%(HEAD)%00%(upstream:short)",
                "refs/remotes",
            ],
        )?;
        branches.extend(parse_branch_rows(&remote_output.stdout, true));
    }

    Ok(branches)
}

pub fn local_branch_exists(repo_path: &Path, name: &str) -> Result<bool, AppError> {
    ref_exists(repo_path, &format!("refs/heads/{name}"))
}

pub fn parse_branches(stdout: &str) -> Vec<GitBranch> {
    parse_branch_rows(stdout, false)
}

fn parse_branch_rows(stdout: &str, is_remote: bool) -> Vec<GitBranch> {
    stdout
        .lines()
        .filter_map(|line| {
            let fields: Vec<&str> = line.split('\0').collect();
            let name = fields.first()?.trim();
            if name.is_empty() {
                return None;
            }
            if is_remote && name.ends_with("/HEAD") {
                return None;
            }

            let upstream = fields
                .get(2)
                .map(|value| value.trim())
                .filter(|value| !value.is_empty())
                .map(str::to_string);

            Some(GitBranch {
                name: name.to_string(),
                is_current: fields.get(1).is_some_and(|value| value.trim() == "*"),
                is_remote,
                upstream,
            })
        })
        .collect()
}

pub fn remote_branch_exists(repo_path: &Path, name: &str) -> Result<bool, AppError> {
    ref_exists(repo_path, &format!("refs/remotes/{name}"))
}

pub fn remote_exists(repo_path: &Path, name: &str) -> Result<bool, AppError> {
    let output = runner::run_git(repo_path, &["remote"])?;

    Ok(output.stdout.lines().any(|remote| remote.trim() == name))
}

/// 创建本地分支；可选基于 start_point，并 checkout 到新分支
pub fn create_branch(
    repo_path: &Path,
    name: &str,
    start_point: Option<&str>,
    checkout: bool,
) -> Result<(), AppError> {
    if local_branch_exists(repo_path, name)? {
        return Err(AppError::new("VALIDATION", "本地分支已存在"));
    }

    if checkout {
        let mut args = vec!["switch", "-c", name];
        if let Some(start) = start_point {
            args.push(start);
        }
        runner::run_git(repo_path, &args)?;
    } else if let Some(start) = start_point {
        runner::run_git(repo_path, &["branch", "--", name, start])?;
    } else {
        runner::run_git(repo_path, &["branch", "--", name])?;
    }

    Ok(())
}

fn ref_exists(repo_path: &Path, full_ref: &str) -> Result<bool, AppError> {
    let output =
        runner::run_git_allow_nonzero(repo_path, &["show-ref", "--verify", "--quiet", full_ref])?;

    match output.code {
        0 => Ok(true),
        1 => Ok(false),
        _ => Err(AppError::new("GIT_FAILED", "检查 Git 引用失败").with_details(output.stderr)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_null_separated_branch_rows() {
        let stdout = "main\0*\0origin/main\nfeature/task\0 \0\n";

        let branches = parse_branches(stdout);

        assert_eq!(
            branches,
            vec![
                GitBranch {
                    name: "main".into(),
                    is_current: true,
                    is_remote: false,
                    upstream: Some("origin/main".into()),
                },
                GitBranch {
                    name: "feature/task".into(),
                    is_current: false,
                    is_remote: false,
                    upstream: None,
                },
            ]
        );
    }

    #[test]
    fn parses_remote_branch_rows_and_skips_symbolic_head() {
        let stdout = "origin/HEAD\0 \0origin/main\norigin/main\0 \0\norigin/feature/task\0 \0\n";

        let branches = parse_branch_rows(stdout, true);

        assert_eq!(
            branches,
            vec![
                GitBranch {
                    name: "origin/main".into(),
                    is_current: false,
                    is_remote: true,
                    upstream: None,
                },
                GitBranch {
                    name: "origin/feature/task".into(),
                    is_current: false,
                    is_remote: true,
                    upstream: None,
                },
            ]
        );
    }
}
