use serde::Serialize;
use std::path::Path;

use crate::error::AppError;
use crate::git::runner;

/// lint-staged 失败/进程被杀时留下的自动备份标记
const LINT_STAGED_BACKUP_MARKER: &str = "lint-staged automatic backup";

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStashEntry {
    pub index: u32,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStashListResult {
    pub entries: Vec<GitStashEntry>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreLintStagedResult {
    /// 是否找到并尝试恢复
    pub restored: bool,
    /// 恢复的 stash 下标（若有）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub index: Option<u32>,
}

/// `git stash list` → 结构化条目
pub fn list_stash(repo_path: &Path) -> Result<GitStashListResult, AppError> {
    let output = runner::run_git(repo_path, &["stash", "list", "--pretty=format:%gd\t%s"])?;
    Ok(GitStashListResult {
        entries: parse_stash_list(&output.stdout),
    })
}

pub fn parse_stash_list(stdout: &str) -> Vec<GitStashEntry> {
    let mut entries = Vec::new();
    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let Some((ref_part, message)) = line.split_once('\t') else {
            continue;
        };
        // stash@{0} / stash@{1}
        let Some(index) = parse_stash_index(ref_part.trim()) else {
            continue;
        };
        entries.push(GitStashEntry {
            index,
            message: message.trim().to_string(),
        });
    }
    entries
}

fn parse_stash_index(ref_part: &str) -> Option<u32> {
    let inner = ref_part.strip_prefix("stash@{")?.strip_suffix('}')?.trim();
    inner.parse().ok()
}

/// `git stash apply stash@{n}`（保留备份，便于再次核对）
pub fn apply_stash(repo_path: &Path, index: u32) -> Result<(), AppError> {
    let ref_name = format!("stash@{{{index}}}");
    runner::run_git(repo_path, &["stash", "apply", "--", &ref_name])?;
    Ok(())
}

fn is_lint_staged_backup(message: &str) -> bool {
    message
        .to_ascii_lowercase()
        .contains(LINT_STAGED_BACKUP_MARKER)
}

/// 提交失败后：若存在 lint-staged 自动备份，apply 最新一条（index 最小）
pub fn try_restore_lint_staged_backup(repo_path: &Path) -> RestoreLintStagedResult {
    let Ok(list) = list_stash(repo_path) else {
        return RestoreLintStagedResult {
            restored: false,
            index: None,
        };
    };
    let Some(entry) = list
        .entries
        .iter()
        .filter(|entry| is_lint_staged_backup(&entry.message))
        .min_by_key(|entry| entry.index)
    else {
        return RestoreLintStagedResult {
            restored: false,
            index: None,
        };
    };
    let index = entry.index;
    match apply_stash(repo_path, index) {
        Ok(()) => RestoreLintStagedResult {
            restored: true,
            index: Some(index),
        },
        Err(_) => RestoreLintStagedResult {
            restored: false,
            index: Some(index),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::{is_lint_staged_backup, parse_stash_list};

    #[test]
    fn parses_stash_list_lines() {
        let stdout = "\
stash@{0}\tlint-staged automatic backup
stash@{1}\tWIP on main: abc123 feat: demo
";
        let entries = parse_stash_list(stdout);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].index, 0);
        assert_eq!(entries[0].message, "lint-staged automatic backup");
        assert_eq!(entries[1].index, 1);
    }

    #[test]
    fn detects_lint_staged_marker() {
        assert!(is_lint_staged_backup("lint-staged automatic backup"));
        assert!(is_lint_staged_backup(
            "On main: lint-staged automatic backup"
        ));
        assert!(!is_lint_staged_backup("WIP on main"));
    }
}
