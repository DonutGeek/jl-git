use serde::Serialize;
use std::path::Path;

use crate::error::AppError;
use crate::git::runner;

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranch {
    pub name: String,
    pub is_current: bool,
    /// 是否为仓库默认分支（通常对应 origin/HEAD）
    pub is_default: bool,
    pub is_remote: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub upstream: Option<String>,
    /// tip 提交短 hash；无则空串
    pub tip_short_id: String,
    /// tip 提交作者时间（ISO-8601）；无则空串
    pub tip_authored_at: String,
    /// tip 提交作者名；无则空串
    pub tip_author_name: String,
}

pub fn list_branches(repo_path: &Path, include_remote: bool) -> Result<Vec<GitBranch>, AppError> {
    let local_output = runner::run_git(
        repo_path,
        &[
            "for-each-ref",
            "--format=%(refname:short)%00%(HEAD)%00%(upstream:short)%00%(objectname:short)%00%(authordate:iso-strict)%00%(authorname)",
            "refs/heads",
        ],
    )?;

    let mut branches = parse_branches(&local_output.stdout);
    if include_remote {
        let remote_output = runner::run_git(
            repo_path,
            &[
                "for-each-ref",
                "--format=%(refname:short)%00%(HEAD)%00%(upstream:short)%00%(objectname:short)%00%(authordate:iso-strict)%00%(authorname)",
                "refs/remotes",
            ],
        )?;
        branches.extend(parse_branch_rows(&remote_output.stdout, true));
    }

    let default_name = resolve_default_branch_name(repo_path);
    mark_default_branches(&mut branches, default_name.as_deref());

    Ok(branches)
}

/// 解析默认分支短名：优先 `origin/HEAD`，再回退本地是否存在 `main` / `master`
fn resolve_default_branch_name(repo_path: &Path) -> Option<String> {
    if let Ok(output) = runner::run_git_allow_nonzero(
        repo_path,
        &["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"],
    ) {
        if output.code == 0 {
            if let Some(name) = parse_origin_head_target(&output.stdout) {
                return Some(name);
            }
        }
    }

    for candidate in ["main", "master"] {
        if let Ok(true) = ref_exists(repo_path, &format!("refs/heads/{candidate}")) {
            return Some(candidate.to_string());
        }
    }

    None
}

fn parse_origin_head_target(stdout: &str) -> Option<String> {
    let raw = stdout.trim();
    if raw.is_empty() {
        return None;
    }
    let name = raw
        .strip_prefix("refs/remotes/origin/")
        .or_else(|| raw.strip_prefix("origin/"))
        .unwrap_or(raw);
    if name.is_empty() || name == "HEAD" {
        None
    } else {
        Some(name.to_string())
    }
}

fn mark_default_branches(branches: &mut [GitBranch], default_name: Option<&str>) {
    let Some(default_name) = default_name else {
        return;
    };
    let remote_default = format!("origin/{default_name}");
    for branch in branches.iter_mut() {
        branch.is_default = if branch.is_remote {
            branch.name == remote_default
        } else {
            branch.name == default_name
        };
    }
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
            // 跳过远端 symbolic HEAD：短名可能是 origin/HEAD，也可能被收成仅 remote 名（origin）
            if is_remote && (name.ends_with("/HEAD") || !name.contains('/')) {
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
                is_default: false,
                is_remote,
                upstream,
                tip_short_id: fields
                    .get(3)
                    .map(|value| value.trim().to_string())
                    .unwrap_or_default(),
                tip_authored_at: fields
                    .get(4)
                    .map(|value| value.trim().to_string())
                    .unwrap_or_default(),
                tip_author_name: fields
                    .get(5)
                    .map(|value| value.trim().to_string())
                    .unwrap_or_default(),
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

/// 创建本地分支；可选基于 start_point，并 checkout 到新分支。
/// 对齐常见桌面客户端：`branch --no-track` → `checkout --progress` → `submodule update`。
pub fn create_branch(
    repo_path: &Path,
    name: &str,
    start_point: Option<&str>,
    checkout: bool,
) -> Result<(), AppError> {
    if local_branch_exists(repo_path, name)? {
        return Err(AppError::new("VALIDATION", "本地分支已存在"));
    }

    // 仅创建本地分支，不设置 upstream（发布由 push --set-upstream 完成）
    if let Some(start) = start_point {
        runner::run_git(repo_path, &["branch", "--no-track", "--", name, start])?;
    } else {
        runner::run_git(repo_path, &["branch", "--no-track", "--", name])?;
    }

    if checkout {
        checkout_local_branch(repo_path, name)?;
    }

    Ok(())
}

/// 切换到已存在的本地分支，并尝试同步 submodule
pub fn checkout_local_branch(repo_path: &Path, name: &str) -> Result<(), AppError> {
    // 分支名必须在 `--` 之前；`--` 后是 pathspec（参考：checkout --progress <branch> --）
    runner::run_git(repo_path, &["checkout", "--progress", name, "--"])?;
    // 无 submodule 时仍成功；有则与工作树对齐
    runner::run_git(repo_path, &["submodule", "update", "--init", "--recursive"])?;
    Ok(())
}

/// 删除本地分支；`force` 时使用 `-D`
pub fn delete_branch(repo_path: &Path, name: &str, force: bool) -> Result<(), AppError> {
    if !local_branch_exists(repo_path, name)? {
        return Err(AppError::new("VALIDATION", "本地分支不存在"));
    }

    let flag = if force { "-D" } else { "-d" };
    // 对齐常见客户端：`git branch -D <name>`
    runner::run_git(repo_path, &["branch", flag, name])?;
    Ok(())
}

/// 删除远端分支：对齐常见客户端 `git push origin :<branch>`
pub fn delete_remote_branch(repo_path: &Path, remote: &str, name: &str) -> Result<(), AppError> {
    use std::time::Duration;

    let remote_ref = format!("{remote}/{name}");
    if !remote_branch_exists(repo_path, &remote_ref)? {
        return Err(AppError::new("VALIDATION", "远端分支不存在"));
    }

    let delete_refspec = format!(":{name}");
    runner::run_git_timeout(
        repo_path,
        &["-c", "protocol.version=2", "push", remote, &delete_refspec],
        Duration::from_secs(180),
    )?;
    Ok(())
}

/// 重命名本地分支：`git branch -m <old> <new>`
pub fn rename_branch(repo_path: &Path, old_name: &str, new_name: &str) -> Result<(), AppError> {
    if !local_branch_exists(repo_path, old_name)? {
        return Err(AppError::new("VALIDATION", "本地分支不存在"));
    }
    if local_branch_exists(repo_path, new_name)? {
        return Err(AppError::new("VALIDATION", "目标分支名已存在"));
    }

    runner::run_git(repo_path, &["branch", "-m", "--", old_name, new_name])?;
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
        let stdout = "main\0*\0origin/main\0a1b2c3d\02026-01-15T10:00:00+08:00\0Alice\nfeature/task\0 \0\0d4e5f6a\02025-12-01T08:30:00+08:00\0Bob\n";

        let branches = parse_branches(stdout);

        assert_eq!(
            branches,
            vec![
                GitBranch {
                    name: "main".into(),
                    is_current: true,
                    is_default: false,
                    is_remote: false,
                    upstream: Some("origin/main".into()),
                    tip_short_id: "a1b2c3d".into(),
                    tip_authored_at: "2026-01-15T10:00:00+08:00".into(),
                    tip_author_name: "Alice".into(),
                },
                GitBranch {
                    name: "feature/task".into(),
                    is_current: false,
                    is_default: false,
                    is_remote: false,
                    upstream: None,
                    tip_short_id: "d4e5f6a".into(),
                    tip_authored_at: "2025-12-01T08:30:00+08:00".into(),
                    tip_author_name: "Bob".into(),
                },
            ]
        );
    }

    #[test]
    fn parses_remote_branch_rows_and_skips_symbolic_head() {
        // 含 origin/HEAD 与短名收成 origin 两种形式
        let stdout =
            "origin\0 \0origin/main\0a1b2c3d\02026-01-15T10:00:00+08:00\0Alice\norigin/HEAD\0 \0origin/main\0a1b2c3d\02026-01-15T10:00:00+08:00\0Alice\norigin/main\0 \0\0a1b2c3d\02026-01-15T10:00:00+08:00\0Alice\norigin/feature/task\0 \0\0d4e5f6a\02025-12-01T08:30:00+08:00\0Bob\n";

        let branches = parse_branch_rows(stdout, true);

        assert_eq!(
            branches,
            vec![
                GitBranch {
                    name: "origin/main".into(),
                    is_current: false,
                    is_default: false,
                    is_remote: true,
                    upstream: None,
                    tip_short_id: "a1b2c3d".into(),
                    tip_authored_at: "2026-01-15T10:00:00+08:00".into(),
                    tip_author_name: "Alice".into(),
                },
                GitBranch {
                    name: "origin/feature/task".into(),
                    is_current: false,
                    is_default: false,
                    is_remote: true,
                    upstream: None,
                    tip_short_id: "d4e5f6a".into(),
                    tip_authored_at: "2025-12-01T08:30:00+08:00".into(),
                    tip_author_name: "Bob".into(),
                },
            ]
        );
    }

    #[test]
    fn parses_origin_head_and_marks_default() {
        assert_eq!(
            parse_origin_head_target("refs/remotes/origin/main\n"),
            Some("main".into())
        );

        let mut branches = vec![
            GitBranch {
                name: "main".into(),
                is_current: false,
                is_default: false,
                is_remote: false,
                upstream: None,
                tip_short_id: String::new(),
                tip_authored_at: String::new(),
                tip_author_name: String::new(),
            },
            GitBranch {
                name: "jingyue/test1".into(),
                is_current: true,
                is_default: false,
                is_remote: false,
                upstream: None,
                tip_short_id: String::new(),
                tip_authored_at: String::new(),
                tip_author_name: String::new(),
            },
            GitBranch {
                name: "origin/main".into(),
                is_current: false,
                is_default: false,
                is_remote: true,
                upstream: None,
                tip_short_id: String::new(),
                tip_authored_at: String::new(),
                tip_author_name: String::new(),
            },
        ];
        mark_default_branches(&mut branches, Some("main"));
        assert!(branches[0].is_default);
        assert!(!branches[1].is_default);
        assert!(branches[2].is_default);
    }
}
