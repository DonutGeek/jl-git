use serde::Serialize;
use std::path::Path;

use crate::error::AppError;
use crate::git::runner;

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusResult {
    pub branch: Option<String>,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub detached: bool,
    pub entries: Vec<GitStatusEntry>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusEntry {
    pub path: String,
    pub index_status: String,
    pub worktree_status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub renamed_from: Option<String>,
}

pub fn get_status(repo_path: &Path) -> Result<GitStatusResult, AppError> {
    // 关闭 quotePath，避免中文路径被八进制转义后破坏解析。
    // --untracked-files=all：展开未跟踪目录内的文件（与 GitHub Desktop 一致），
    // 避免整目录收成一条导致变更数偏少、路径像「目录」难以辨认。
    let output = runner::run_git(
        repo_path,
        &[
            "-c",
            "core.quotepath=false",
            "status",
            "--porcelain=v2",
            "--branch",
            "--untracked-files=all",
        ],
    )?;

    Ok(parse_status(&output.stdout))
}

pub fn parse_status(stdout: &str) -> GitStatusResult {
    let mut result = GitStatusResult {
        branch: None,
        upstream: None,
        ahead: 0,
        behind: 0,
        detached: false,
        entries: Vec::new(),
    };

    for line in stdout.lines() {
        if let Some(head) = line.strip_prefix("# branch.head ") {
            if head == "(detached)" {
                result.detached = true;
                result.branch = None;
            } else {
                result.branch = Some(head.to_string());
            }
            continue;
        }

        if let Some(upstream) = line.strip_prefix("# branch.upstream ") {
            result.upstream = Some(upstream.to_string());
            continue;
        }

        if let Some(ab) = line.strip_prefix("# branch.ab ") {
            parse_ahead_behind(ab, &mut result);
            continue;
        }

        if let Some(path) = line.strip_prefix("? ") {
            result.entries.push(GitStatusEntry {
                path: path.to_string(),
                index_status: "?".to_string(),
                worktree_status: "?".to_string(),
                renamed_from: None,
            });
            continue;
        }

        if let Some(entry) = parse_tracked_entry(line) {
            result.entries.push(entry);
        }
    }

    result
}

fn parse_ahead_behind(value: &str, result: &mut GitStatusResult) {
    let mut parts = value.split_whitespace();
    if let Some(ahead) = parts.next().and_then(|part| part.strip_prefix('+')) {
        result.ahead = ahead.parse().unwrap_or(0);
    }
    if let Some(behind) = parts.next().and_then(|part| part.strip_prefix('-')) {
        result.behind = behind.parse().unwrap_or(0);
    }
}

fn parse_tracked_entry(line: &str) -> Option<GitStatusEntry> {
    let kind = line.chars().next()?;

    match kind {
        '1' => parse_ordinary_entry(line),
        '2' => parse_renamed_entry(line),
        'u' => parse_unmerged_entry(line),
        _ => None,
    }
}

fn parse_status_pair(value: &str) -> Option<(String, String)> {
    let mut chars = value.chars();
    let index_status = chars.next()?.to_string();
    let worktree_status = chars.next()?.to_string();
    Some((index_status, worktree_status))
}

fn parse_ordinary_entry(line: &str) -> Option<GitStatusEntry> {
    let parts: Vec<&str> = line.splitn(9, ' ').collect();
    let (index_status, worktree_status) = parse_status_pair(parts.get(1)?)?;

    Some(GitStatusEntry {
        path: parts.get(8)?.to_string(),
        index_status,
        worktree_status,
        renamed_from: None,
    })
}

fn parse_renamed_entry(line: &str) -> Option<GitStatusEntry> {
    let parts: Vec<&str> = line.splitn(9, ' ').collect();
    let (index_status, worktree_status) = parse_status_pair(parts.get(1)?)?;
    let remainder = parts.get(8)?;
    let mut score_and_paths = remainder.splitn(2, ' ');
    let _score = score_and_paths.next()?;
    let paths = score_and_paths.next()?;
    let mut path_parts = paths.splitn(2, '\t');
    let path = path_parts.next()?.to_string();
    let renamed_from = path_parts.next().map(str::to_string);

    Some(GitStatusEntry {
        path,
        index_status,
        worktree_status,
        renamed_from,
    })
}

fn parse_unmerged_entry(line: &str) -> Option<GitStatusEntry> {
    let parts: Vec<&str> = line.splitn(11, ' ').collect();
    let (index_status, worktree_status) = parse_status_pair(parts.get(1)?)?;

    Some(GitStatusEntry {
        path: parts.get(10)?.to_string(),
        index_status,
        worktree_status,
        renamed_from: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_branch_headers_and_entry_kinds() {
        let stdout = "\
# branch.oid abc123
# branch.head main
# branch.upstream origin/main
# branch.ab +2 -1
1 M. N... 100644 100644 100644 aaaaa bbbbb file.txt
? new-file.txt
2 R. N... 100644 100644 100644 ccccc ddddd R100 new-name.txt\told-name.txt
u UU N... 100644 100644 100644 100644 eeeee fffff ggggg conflict.txt
";

        let result = parse_status(stdout);

        assert_eq!(result.branch, Some("main".into()));
        assert_eq!(result.upstream, Some("origin/main".into()));
        assert_eq!(result.ahead, 2);
        assert_eq!(result.behind, 1);
        assert!(!result.detached);
        assert_eq!(
            result.entries,
            vec![
                GitStatusEntry {
                    path: "file.txt".into(),
                    index_status: "M".into(),
                    worktree_status: ".".into(),
                    renamed_from: None,
                },
                GitStatusEntry {
                    path: "new-file.txt".into(),
                    index_status: "?".into(),
                    worktree_status: "?".into(),
                    renamed_from: None,
                },
                GitStatusEntry {
                    path: "new-name.txt".into(),
                    index_status: "R".into(),
                    worktree_status: ".".into(),
                    renamed_from: Some("old-name.txt".into()),
                },
                GitStatusEntry {
                    path: "conflict.txt".into(),
                    index_status: "U".into(),
                    worktree_status: "U".into(),
                    renamed_from: None,
                },
            ]
        );
    }

    #[test]
    fn parses_detached_head_as_null_branch() {
        let result = parse_status("# branch.head (detached)\n");

        assert_eq!(result.branch, None);
        assert!(result.detached);
    }
}
