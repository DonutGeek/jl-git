use serde::Serialize;
use std::path::Path;

use crate::error::AppError;
use crate::git::{runner, show};

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
    /// 工作区相对 index 的新增行数
    #[serde(skip_serializing_if = "Option::is_none")]
    pub worktree_additions: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub worktree_deletions: Option<u32>,
    /// 暂存区相对 HEAD 的新增行数
    #[serde(skip_serializing_if = "Option::is_none")]
    pub index_additions: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub index_deletions: Option<u32>,
    /// 工作区文件 mtime（Unix 毫秒）；已删除或不存在时为 None
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified_at: Option<i64>,
}

fn empty_entry(path: String, index_status: String, worktree_status: String, renamed_from: Option<String>) -> GitStatusEntry {
    GitStatusEntry {
        path,
        index_status,
        worktree_status,
        renamed_from,
        worktree_additions: None,
        worktree_deletions: None,
        index_additions: None,
        index_deletions: None,
        modified_at: None,
    }
}

/// 是否存在未合并条目（U / AA / DD），供 merge/pull 冲突判定。
pub fn has_unmerged_entries(result: &GitStatusResult) -> bool {
    result.entries.iter().any(is_unmerged_entry)
}

pub fn is_unmerged_entry(entry: &GitStatusEntry) -> bool {
    let index = entry.index_status.as_str();
    let worktree = entry.worktree_status.as_str();
    index.eq_ignore_ascii_case("u")
        || worktree.eq_ignore_ascii_case("u")
        || (index.eq_ignore_ascii_case("a") && worktree.eq_ignore_ascii_case("a"))
        || (index.eq_ignore_ascii_case("d") && worktree.eq_ignore_ascii_case("d"))
}

pub fn conflict_paths(result: &GitStatusResult) -> Vec<String> {
    result
        .entries
        .iter()
        .filter(|entry| is_unmerged_entry(entry))
        .map(|entry| entry.path.clone())
        .collect()
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

    let mut result = parse_status(&output.stdout);
    attach_status_numstat(repo_path, &mut result);
    attach_status_mtimes(repo_path, &mut result);
    Ok(result)
}

/// 附加工作区 / 暂存区 numstat（失败不影响 status 主结果）
fn attach_status_numstat(repo_path: &Path, result: &mut GitStatusResult) {
    if let Ok(output) = runner::run_git_allow_nonzero(
        repo_path,
        &["-c", "core.quotepath=false", "diff", "--numstat", "-z"],
    ) {
        if output.code == 0 {
            let stats = show::parse_numstat_z(&output.stdout);
            for entry in &mut result.entries {
                if let Some((additions, deletions)) = stats.get(&entry.path) {
                    entry.worktree_additions = *additions;
                    entry.worktree_deletions = *deletions;
                }
            }
        }
    }

    if let Ok(output) = runner::run_git_allow_nonzero(
        repo_path,
        &[
            "-c",
            "core.quotepath=false",
            "diff",
            "--cached",
            "--numstat",
            "-z",
        ],
    ) {
        if output.code == 0 {
            let stats = show::parse_numstat_z(&output.stdout);
            for entry in &mut result.entries {
                if let Some((additions, deletions)) = stats.get(&entry.path) {
                    entry.index_additions = *additions;
                    entry.index_deletions = *deletions;
                }
            }
        }
    }
}

/// 附加工作区文件修改时间（失败不影响 status 主结果）
fn attach_status_mtimes(repo_path: &Path, result: &mut GitStatusResult) {
    for entry in &mut result.entries {
        let relative = Path::new(&entry.path);
        if relative.is_absolute() {
            continue;
        }
        entry.modified_at = file_modified_at_ms(&repo_path.join(relative));
    }
}

fn file_modified_at_ms(path: &Path) -> Option<i64> {
    let modified = std::fs::metadata(path).ok()?.modified().ok()?;
    let duration = modified
        .duration_since(std::time::SystemTime::UNIX_EPOCH)
        .ok()?;
    Some(duration.as_millis() as i64)
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
            result.entries.push(empty_entry(
                path.to_string(),
                "?".to_string(),
                "?".to_string(),
                None,
            ));
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

    Some(empty_entry(
        parts.get(8)?.to_string(),
        index_status,
        worktree_status,
        None,
    ))
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

    Some(empty_entry(path, index_status, worktree_status, renamed_from))
}

fn parse_unmerged_entry(line: &str) -> Option<GitStatusEntry> {
    let parts: Vec<&str> = line.splitn(11, ' ').collect();
    let (index_status, worktree_status) = parse_status_pair(parts.get(1)?)?;

    Some(empty_entry(
        parts.get(10)?.to_string(),
        index_status,
        worktree_status,
        None,
    ))
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
                empty_entry("file.txt".into(), "M".into(), ".".into(), None),
                empty_entry("new-file.txt".into(), "?".into(), "?".into(), None),
                empty_entry(
                    "new-name.txt".into(),
                    "R".into(),
                    ".".into(),
                    Some("old-name.txt".into()),
                ),
                empty_entry("conflict.txt".into(), "U".into(), "U".into(), None),
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
