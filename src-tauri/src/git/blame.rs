use serde::Serialize;
use std::path::Path;

use crate::error::AppError;
use crate::git::{
    path::{validate_git_ref, validate_repo_relative_paths},
    runner,
};

#[derive(Debug, PartialEq, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitBlameLine {
    /// 1-based 行号（相对被 blame 的文件版本）
    pub line: u32,
    pub commit_id: String,
    pub short_id: String,
    pub author_name: String,
    pub authored_at: String,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBlameResult {
    pub lines: Vec<GitBlameLine>,
}

/// `git blame --line-porcelain`；`rev` 为空时对工作区文件追溯。
pub fn get_blame(
    repo_path: &Path,
    file_path: &str,
    rev: Option<&str>,
) -> Result<GitBlameResult, AppError> {
    validate_repo_relative_paths(&[file_path.to_string()])?;
    if let Some(rev) = rev {
        validate_git_ref(rev)?;
    }

    let mut args = vec!["blame".to_string(), "--line-porcelain".to_string()];
    if let Some(rev) = rev {
        args.push(rev.to_string());
    }
    args.push("--".to_string());
    args.push(file_path.to_string());

    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let output = runner::run_git_allow_nonzero(repo_path, &arg_refs)?;

    if output.code != 0 {
        let message = output
            .stderr
            .lines()
            .next()
            .unwrap_or("git blame 失败")
            .to_string();
        return Err(AppError::new("GIT_FAILED", message).with_details(output.stderr));
    }

    Ok(GitBlameResult {
        lines: parse_blame_porcelain(&output.stdout),
    })
}

fn parse_blame_porcelain(stdout: &str) -> Vec<GitBlameLine> {
    let mut lines = Vec::new();
    let mut commit_id = String::new();
    let mut short_id = String::new();
    let mut author_name = String::new();
    let mut authored_at = String::new();
    let mut line_no: u32 = 0;

    for raw in stdout.lines() {
        if let Some(rest) = raw.strip_prefix('\t') {
            let _ = rest;
            if line_no > 0 && !commit_id.is_empty() {
                lines.push(GitBlameLine {
                    line: line_no,
                    commit_id: commit_id.clone(),
                    short_id: short_id.clone(),
                    author_name: author_name.clone(),
                    authored_at: authored_at.clone(),
                });
            }
            continue;
        }

        if raw.is_empty() {
            continue;
        }

        // 首行：<hash> <orig> <final> [<num>]
        if !raw.starts_with("author")
            && !raw.starts_with("committer")
            && !raw.starts_with("summary")
            && !raw.starts_with("previous")
            && !raw.starts_with("filename")
            && !raw.starts_with("boundary")
        {
            let mut parts = raw.split_whitespace();
            if let Some(hash) = parts.next() {
                if hash.len() >= 7 && hash.chars().all(|c| c.is_ascii_hexdigit()) {
                    commit_id = hash.to_string();
                    short_id = hash.chars().take(7).collect();
                    // final line number 是第 3 个字段
                    let _orig = parts.next();
                    if let Some(final_line) = parts.next() {
                        line_no = final_line.parse().unwrap_or(0);
                    }
                }
            }
            continue;
        }

        if let Some(name) = raw.strip_prefix("author ") {
            author_name = name.to_string();
            continue;
        }
        if let Some(ts) = raw.strip_prefix("author-time ") {
            if let Ok(secs) = ts.parse::<i64>() {
                authored_at = chrono::DateTime::from_timestamp(secs, 0)
                    .map(|dt| dt.to_rfc3339())
                    .unwrap_or_default();
            }
        }
    }

    lines
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_single_blame_block() {
        let sample = "\
abc1234deadbeef 1 1 1
author Alice
author-mail <a@example.com>
author-time 1700000000
author-tz +0800
committer Alice
committer-mail <a@example.com>
committer-time 1700000000
committer-tz +0800
summary hello
filename src/a.ts
\tconst a = 1;
";
        let lines = parse_blame_porcelain(sample);
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].line, 1);
        assert_eq!(lines[0].author_name, "Alice");
        assert_eq!(lines[0].short_id, "abc1234");
        assert!(!lines[0].authored_at.is_empty());
    }
}
