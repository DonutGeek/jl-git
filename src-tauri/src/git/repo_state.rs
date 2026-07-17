use serde::Serialize;
use std::fs;
use std::path::Path;

use crate::error::AppError;
use crate::git::{runner, status};

/// 冲突一侧的提交摘要（标记行展示用）
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictSideMeta {
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub short_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author_name: Option<String>,
    /// ISO-8601（`%aI`）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub authored_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRepoState {
    /// merge | rebase | cherryPick | none
    pub kind: String,
    pub merging: bool,
    pub ours_label: String,
    pub theirs_label: String,
    pub conflict_count: u32,
    pub conflict_paths: Vec<String>,
    /// `.git/MERGE_MSG` 内容（若有）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub merge_message: Option<String>,
    /// 当前侧（HEAD）提交元信息
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ours_meta: Option<ConflictSideMeta>,
    /// 传入侧（MERGE_HEAD 等）提交元信息
    #[serde(skip_serializing_if = "Option::is_none")]
    pub theirs_meta: Option<ConflictSideMeta>,
}

/// 读取仓库进行中操作状态（MERGE_HEAD 等）与冲突文件列表。
pub fn get_repo_state(repo_path: &Path) -> Result<GitRepoState, AppError> {
    let git_dir = resolve_git_dir(repo_path)?;
    let merging = git_dir.join("MERGE_HEAD").is_file();
    let rebasing = git_dir.join("rebase-merge").is_dir() || git_dir.join("rebase-apply").is_dir();
    let cherry_picking = git_dir.join("CHERRY_PICK_HEAD").is_file();

    let kind = if merging {
        "merge"
    } else if rebasing {
        "rebase"
    } else if cherry_picking {
        "cherryPick"
    } else {
        "none"
    }
    .to_string();

    let status_result = status::get_status(repo_path)?;
    let conflict_paths = status::conflict_paths(&status_result);
    let conflict_count = conflict_paths.len() as u32;

    let ours_label = status_result
        .branch
        .clone()
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| {
            if status_result.detached {
                "HEAD".to_string()
            } else {
                "本地".to_string()
            }
        });

    let theirs_label = if merging {
        read_merge_theirs_label(repo_path, &git_dir).unwrap_or_else(|| "传入".to_string())
    } else if cherry_picking {
        "cherry-pick".to_string()
    } else if rebasing {
        "rebase".to_string()
    } else {
        String::new()
    };

    let merge_message = if merging {
        read_optional_text(&git_dir.join("MERGE_MSG"))
    } else {
        None
    };

    let in_progress = merging || rebasing || cherry_picking;
    let ours_meta = if in_progress {
        Some(ConflictSideMeta {
            label: ours_label.clone(),
            ..read_tip_meta(repo_path, "HEAD").unwrap_or_default()
        })
    } else {
        None
    };
    let theirs_rev = if merging {
        "MERGE_HEAD"
    } else if cherry_picking {
        "CHERRY_PICK_HEAD"
    } else if rebasing {
        "REBASE_HEAD"
    } else {
        ""
    };
    let theirs_meta = if in_progress && !theirs_rev.is_empty() {
        Some(ConflictSideMeta {
            label: theirs_label.clone(),
            ..read_tip_meta(repo_path, theirs_rev).unwrap_or_default()
        })
    } else {
        None
    };

    Ok(GitRepoState {
        kind,
        merging: in_progress,
        ours_label,
        theirs_label,
        conflict_count,
        conflict_paths,
        merge_message,
        ours_meta,
        theirs_meta,
    })
}

fn resolve_git_dir(repo_path: &Path) -> Result<std::path::PathBuf, AppError> {
    let output = runner::run_git(repo_path, &["rev-parse", "--git-dir"])?;
    let raw = output.stdout.trim();
    if raw.is_empty() {
        return Err(AppError::new("NOT_A_REPO", "无法解析 .git 目录"));
    }
    let path = Path::new(raw);
    if path.is_absolute() {
        Ok(path.to_path_buf())
    } else {
        Ok(repo_path.join(path))
    }
}

fn read_merge_theirs_label(repo_path: &Path, git_dir: &Path) -> Option<String> {
    if let Some(msg) = read_optional_text(&git_dir.join("MERGE_MSG")) {
        if let Some(name) = extract_merge_branch_from_message(&msg) {
            return Some(name);
        }
    }

    let named = runner::run_git_allow_nonzero(
        repo_path,
        &["name-rev", "--name-only", "--no-undefined", "MERGE_HEAD"],
    )
    .ok()?;
    if named.code == 0 {
        let label = named.stdout.trim();
        if !label.is_empty() && label != "undefined" {
            return Some(simplify_ref_label(label));
        }
    }

    let short = runner::run_git_allow_nonzero(repo_path, &["rev-parse", "--short", "MERGE_HEAD"]).ok()?;
    if short.code == 0 {
        let hash = short.stdout.trim();
        if !hash.is_empty() {
            return Some(hash.to_string());
        }
    }
    None
}

fn extract_merge_branch_from_message(message: &str) -> Option<String> {
    // Merge branch 'foo' / Merge remote-tracking branch 'origin/foo'
    let line = message.lines().next()?.trim();
    for prefix in [
        "Merge remote-tracking branch '",
        "Merge branch '",
        "Merge branches '",
    ] {
        if let Some(rest) = line.strip_prefix(prefix) {
            if let Some(end) = rest.find('\'') {
                let name = &rest[..end];
                if !name.is_empty() {
                    return Some(simplify_ref_label(name));
                }
            }
        }
    }
    None
}

fn simplify_ref_label(label: &str) -> String {
    label
        .trim()
        .trim_start_matches("remotes/")
        .trim_start_matches("refs/remotes/")
        .trim_start_matches("refs/heads/")
        .to_string()
}

fn read_optional_text(path: &Path) -> Option<String> {
    fs::read_to_string(path)
        .ok()
        .map(|text| text.trim_end().to_string())
        .filter(|text| !text.is_empty())
}

impl Default for ConflictSideMeta {
    fn default() -> Self {
        Self {
            label: String::new(),
            short_id: None,
            author_name: None,
            authored_at: None,
        }
    }
}

/// 读取 tip 的短哈希 / 作者 / 时间（失败时返回空字段）
fn read_tip_meta(repo_path: &Path, rev: &str) -> Option<ConflictSideMeta> {
    let output = runner::run_git_allow_nonzero(
        repo_path,
        &["log", "-1", "--format=%h%n%an%n%aI", rev],
    )
    .ok()?;
    if output.code != 0 {
        return None;
    }
    let mut lines = output.stdout.lines();
    let short_id = lines.next().map(str::trim).filter(|s| !s.is_empty())?;
    let author_name = lines
        .next()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    let authored_at = lines
        .next()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    Some(ConflictSideMeta {
        label: String::new(),
        short_id: Some(short_id.to_string()),
        author_name,
        authored_at,
    })
}

#[cfg(test)]
mod tests {
    use super::{extract_merge_branch_from_message, simplify_ref_label};

    #[test]
    fn extracts_branch_from_merge_message() {
        assert_eq!(
            extract_merge_branch_from_message("Merge branch 'feature/x' into main\n\n"),
            Some("feature/x".to_string())
        );
        assert_eq!(
            extract_merge_branch_from_message(
                "Merge remote-tracking branch 'origin/agent/feat' into daily\n"
            ),
            Some("origin/agent/feat".to_string())
        );
    }

    #[test]
    fn simplifies_remote_labels() {
        assert_eq!(simplify_ref_label("remotes/origin/foo"), "origin/foo");
        assert_eq!(simplify_ref_label("refs/heads/main"), "main");
    }
}
