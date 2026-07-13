use serde::Serialize;
use std::path::Path;

use crate::error::AppError;
use crate::git::{path::validate_git_ref, runner};

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitSummary {
    pub id: String,
    pub short_id: String,
    pub author_name: String,
    pub authored_at: String,
    pub subject: String,
    /// 指向该提交的分支 / 标签名（已清洗，不含 HEAD）
    pub refs: Vec<String>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitLogResult {
    pub commits: Vec<GitCommitSummary>,
    pub has_more: bool,
}

pub fn get_log(
    repo_path: &Path,
    skip: u32,
    limit: u32,
    ref_name: Option<&str>,
) -> Result<GitLogResult, AppError> {
    if limit == 0 {
        return Err(AppError::new("VALIDATION", "提交数量必须大于 0"));
    }

    if limit > 200 {
        return Err(AppError::new("VALIDATION", "提交数量不能超过 200"));
    }

    if let Some(ref_name) = ref_name {
        validate_git_ref(ref_name)?;
    }

    let fetch_limit = limit + 1;
    let mut args = vec![
        "log".to_string(),
        // %D = 装饰（HEAD、分支、标签），供历史列表标签列
        "--format=%H%x00%h%x00%an%x00%aI%x00%s%x00%D".to_string(),
        "--decorate=short".to_string(),
        format!("--skip={skip}"),
        format!("--max-count={fetch_limit}"),
    ];

    if let Some(ref_name) = ref_name {
        args.push(ref_name.to_string());
    }

    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let output = runner::run_git_allow_nonzero(repo_path, &arg_refs)?;

    if output.code != 0 {
        if is_empty_history(repo_path, &output.stdout, &output.stderr)? {
            return Ok(GitLogResult {
                commits: vec![],
                has_more: false,
            });
        }

        let message = output
            .stderr
            .lines()
            .next()
            .unwrap_or("git 命令失败")
            .to_string();
        return Err(AppError::new("GIT_FAILED", message).with_details(output.stderr));
    }

    Ok(parse_log(&output.stdout, limit as usize))
}

fn is_empty_history(repo_path: &Path, stdout: &str, stderr: &str) -> Result<bool, AppError> {
    if !looks_like_empty_history_output(stdout, stderr) {
        return Ok(false);
    }

    let head = runner::run_git_allow_nonzero(repo_path, &["rev-parse", "--verify", "HEAD"])?;
    Ok(head.code != 0)
}

fn looks_like_empty_history_output(stdout: &str, stderr: &str) -> bool {
    let stderr = stderr.to_lowercase();
    stderr.contains("does not have any commits yet")
        || stderr.contains("bad default revision")
        || stderr.contains("unknown revision")
        || stdout.trim().is_empty()
}

pub fn parse_log(stdout: &str, limit: usize) -> GitLogResult {
    let mut commits: Vec<GitCommitSummary> = stdout
        .lines()
        .filter_map(|line| {
            let fields: Vec<&str> = line.splitn(6, '\0').collect();
            Some(GitCommitSummary {
                id: fields.first()?.to_string(),
                short_id: fields.get(1)?.to_string(),
                author_name: fields.get(2)?.to_string(),
                authored_at: fields.get(3)?.to_string(),
                subject: fields.get(4)?.to_string(),
                refs: parse_decorations(fields.get(5).copied().unwrap_or("")),
            })
        })
        .collect();

    let has_more = commits.len() > limit;
    if has_more {
        commits.truncate(limit);
    }

    GitLogResult { commits, has_more }
}

/// 解析 `git log --decorate=short` 的 %D，例如：
/// `HEAD -> main, origin/main, tag: v1.0` → `["main", "origin&main", "v1.0"]`
fn parse_decorations(raw: &str) -> Vec<String> {
    let mut refs = Vec::new();

    for part in raw.split(',') {
        let token = part.trim();
        if token.is_empty() {
            continue;
        }

        if let Some(rest) = token.strip_prefix("HEAD -> ") {
            let name = rest.trim();
            if !name.is_empty() {
                refs.push(name.to_string());
            }
            continue;
        }

        if token == "HEAD" {
            continue;
        }

        if let Some(tag) = token.strip_prefix("tag: ") {
            let name = tag.trim();
            if !name.is_empty() {
                refs.push(name.to_string());
            }
            continue;
        }

        // 远端分支展示为 origin&daily，贴近参考客户端
        if let Some((remote, branch)) = token.split_once('/') {
            if !remote.is_empty() && !branch.is_empty() && remote != "refs" {
                refs.push(format!("{remote}&{branch}"));
                continue;
            }
        }

        refs.push(token.to_string());
    }

    refs
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn truncates_extra_commit_and_sets_has_more() {
        let stdout = "\
aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\0aaaaaaa\0Alice\02026-07-09T09:00:00+00:00\0first subject\0HEAD -> main, origin/main
bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\0bbbbbbb\0Bob\02026-07-09T10:00:00+00:00\0second subject\0
";

        let result = parse_log(stdout, 1);

        assert!(result.has_more);
        assert_eq!(
            result.commits,
            vec![GitCommitSummary {
                id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".into(),
                short_id: "aaaaaaa".into(),
                author_name: "Alice".into(),
                authored_at: "2026-07-09T09:00:00+00:00".into(),
                subject: "first subject".into(),
                refs: vec!["main".into(), "origin&main".into()],
            }]
        );
    }

    #[test]
    fn parses_tag_and_skips_bare_head() {
        let refs = parse_decorations("HEAD, tag: v1.2.3, origin/daily");
        assert_eq!(refs, vec!["v1.2.3".to_string(), "origin&daily".to_string()]);
    }

    #[test]
    fn rejects_zero_limit_before_running_git() {
        let error = get_log(Path::new("."), 0, 0, None).expect_err("zero limit should fail");

        assert_eq!(error.code, "VALIDATION");
    }

    #[test]
    fn rejects_option_like_ref_before_running_git() {
        let error =
            get_log(Path::new("."), 0, 50, Some("-main")).expect_err("invalid ref should fail");

        assert_eq!(error.code, "VALIDATION");
    }

    #[test]
    fn detects_empty_history_errors() {
        assert!(looks_like_empty_history_output(
            "",
            "fatal: your current branch 'main' does not have any commits yet"
        ));
        assert!(looks_like_empty_history_output(
            "",
            "fatal: bad default revision 'HEAD'"
        ));
        assert!(looks_like_empty_history_output(
            "",
            "fatal: ambiguous argument 'HEAD': unknown revision"
        ));
        assert!(!looks_like_empty_history_output(
            "partial output",
            "fatal: not a git repository"
        ));
    }
}
