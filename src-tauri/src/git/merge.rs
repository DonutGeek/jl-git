use serde::{Deserialize, Serialize};
use std::path::Path;

use crate::error::AppError;
use crate::git::{runner, status};

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MergeMode {
    Default,
    NoFf,
    Squash,
    Resolve,
    Ort,
    NoCommit,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitMergeResult {
    pub ok: bool,
    pub conflict: bool,
}

pub fn merge(
    repo_path: &Path,
    source: &str,
    mode: MergeMode,
    autostash: bool,
) -> Result<GitMergeResult, AppError> {
    let args = build_merge_args(source, mode, autostash);
    let output = runner::run_git_allow_nonzero(repo_path, &args)?;

    if output.code == 0 {
        return Ok(GitMergeResult {
            ok: true,
            conflict: false,
        });
    }

    if status::has_unmerged_entries(&status::get_status(repo_path)?) {
        return Ok(GitMergeResult {
            ok: false,
            conflict: true,
        });
    }

    let details = format!("{}\n{}", output.stdout, output.stderr)
        .trim()
        .to_string();
    Err(AppError::new("GIT_FAILED", "合并失败").with_details(details))
}

fn build_merge_args(source: &str, mode: MergeMode, autostash: bool) -> Vec<&str> {
    let mut args = vec!["merge"];
    match mode {
        MergeMode::Default => {}
        MergeMode::NoFf => args.push("--no-ff"),
        MergeMode::Squash => args.push("--squash"),
        MergeMode::Resolve => args.extend(["-s", "resolve"]),
        MergeMode::Ort => args.extend(["-s", "ort"]),
        MergeMode::NoCommit => args.push("--no-commit"),
    }
    if autostash && !matches!(mode, MergeMode::Squash) {
        args.push("--autostash");
    }
    args.push(source);
    args
}

#[cfg(test)]
mod tests {
    use super::{build_merge_args, MergeMode};
    use crate::git::status::{self, GitStatusEntry, GitStatusResult};

    #[test]
    fn builds_args_for_each_supported_merge_mode() {
        assert_eq!(
            build_merge_args("feature", MergeMode::Default, false),
            vec!["merge", "feature"]
        );
        assert_eq!(
            build_merge_args("feature", MergeMode::NoFf, false),
            vec!["merge", "--no-ff", "feature"]
        );
        assert_eq!(
            build_merge_args("feature", MergeMode::Squash, false),
            vec!["merge", "--squash", "feature"]
        );
        assert_eq!(
            build_merge_args("feature", MergeMode::Resolve, false),
            vec!["merge", "-s", "resolve", "feature"]
        );
        assert_eq!(
            build_merge_args("feature", MergeMode::Ort, false),
            vec!["merge", "-s", "ort", "feature"]
        );
        assert_eq!(
            build_merge_args("feature", MergeMode::NoCommit, false),
            vec!["merge", "--no-commit", "feature"]
        );
    }

    #[test]
    fn does_not_autostash_squash_merge() {
        assert_eq!(
            build_merge_args("feature", MergeMode::Squash, true),
            vec!["merge", "--squash", "feature"]
        );
    }

    #[test]
    fn detects_unmerged_status_entry_as_conflict() {
        assert!(status::has_unmerged_entries(&GitStatusResult {
            branch: Some("main".to_string()),
            upstream: None,
            ahead: 0,
            behind: 0,
            detached: false,
            entries: vec![GitStatusEntry {
                path: "conflict.txt".to_string(),
                index_status: "u".to_string(),
                worktree_status: "u".to_string(),
                renamed_from: None,
                worktree_additions: None,
                worktree_deletions: None,
                index_additions: None,
                index_deletions: None,
                modified_at: None,
            }],
        }));
    }
}
