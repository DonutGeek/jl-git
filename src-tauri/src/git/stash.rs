use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

use crate::error::AppError;
use crate::git::runner;

/// lint-staged 失败/进程被杀时留下的自动备份标记
const LINT_STAGED_BACKUP_MARKER: &str = "lint-staged automatic backup";

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStashEntry {
    pub index: u32,
    pub oid: String,
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
    let output = runner::run_git(
        repo_path,
        &["stash", "list", "--pretty=format:%gd%x09%H%x09%gs"],
    )?;
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
        let mut fields = line.splitn(3, '\t');
        let Some(ref_part) = fields.next() else {
            continue;
        };
        let Some(oid) = fields.next() else {
            continue;
        };
        let Some(message) = fields.next() else {
            continue;
        };
        // stash@{0} / stash@{1}
        let Some(index) = parse_stash_index(ref_part.trim()) else {
            continue;
        };
        entries.push(GitStashEntry {
            index,
            oid: oid.trim().to_string(),
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

#[derive(Debug, Serialize, Deserialize)]
struct LintStagedRecoveryMarker {
    known_oids: HashSet<String>,
}

pub struct LintStagedRecovery {
    marker_path: PathBuf,
    known_oids: HashSet<String>,
}

impl LintStagedRecovery {
    pub fn begin(repo_path: &Path) -> Result<Self, AppError> {
        let marker_path = resolve_git_path(repo_path, "jlgit-lint-staged-recovery.json")?;
        if marker_path.exists() {
            return Err(AppError::new(
                "GIT_RECOVERY_REQUIRED",
                "检测到上次提交的恢复任务尚未完成，请刷新仓库状态后重试",
            ));
        }
        let known_oids = lint_staged_oids(repo_path)?;
        let marker = LintStagedRecoveryMarker {
            known_oids: known_oids.clone(),
        };
        let bytes = serde_json::to_vec(&marker).map_err(|error| {
            AppError::new("INTERNAL", "无法生成提交恢复标记").with_details(error.to_string())
        })?;
        let temporary_marker = marker_path.with_extension(format!("jlgit-tmp-{}", Uuid::new_v4()));
        let write_result = (|| -> Result<(), AppError> {
            fs::write(&temporary_marker, bytes).map_err(|error| {
                AppError::new("INTERNAL", "无法写入提交恢复标记").with_details(error.to_string())
            })?;
            fs::File::open(&temporary_marker)
                .and_then(|file| file.sync_all())
                .map_err(|error| {
                    AppError::new("INTERNAL", "无法落盘提交恢复标记")
                        .with_details(error.to_string())
                })?;
            fs::rename(&temporary_marker, &marker_path).map_err(|error| {
                AppError::new("INTERNAL", "无法启用提交恢复标记").with_details(error.to_string())
            })
        })();
        if write_result.is_err() {
            let _ = fs::remove_file(&temporary_marker);
        }
        write_result?;
        Ok(Self {
            marker_path,
            known_oids,
        })
    }

    pub fn complete(self) {
        let _ = fs::remove_file(self.marker_path);
    }

    pub fn restore_after_failure(&self, repo_path: &Path) -> RestoreLintStagedResult {
        restore_new_lint_staged_backup(repo_path, &self.known_oids)
    }
}

fn resolve_git_path(repo_path: &Path, name: &str) -> Result<PathBuf, AppError> {
    let output = runner::run_git(repo_path, &["rev-parse", "--git-path", name])?;
    let raw = output.stdout.trim();
    if raw.is_empty() {
        return Err(AppError::new("GIT_FAILED", "无法解析 Git 元数据路径"));
    }
    let path = Path::new(raw);
    Ok(if path.is_absolute() {
        path.to_path_buf()
    } else {
        repo_path.join(path)
    })
}

fn lint_staged_oids(repo_path: &Path) -> Result<HashSet<String>, AppError> {
    Ok(list_stash(repo_path)?
        .entries
        .into_iter()
        .filter(|entry| is_lint_staged_backup(&entry.message))
        .map(|entry| entry.oid)
        .collect())
}

fn restore_new_lint_staged_backup(
    repo_path: &Path,
    known_oids: &HashSet<String>,
) -> RestoreLintStagedResult {
    let Ok(list) = list_stash(repo_path) else {
        return RestoreLintStagedResult {
            restored: false,
            index: None,
        };
    };
    let Some(entry) = list
        .entries
        .iter()
        .filter(|entry| is_lint_staged_backup(&entry.message) && !known_oids.contains(&entry.oid))
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

/// 应用启动后的崩溃恢复只读取 JLGit 在提交前写入的标记，禁止误用任意旧 stash。
pub fn try_restore_lint_staged_backup(repo_path: &Path) -> RestoreLintStagedResult {
    let Ok(marker_path) = resolve_git_path(repo_path, "jlgit-lint-staged-recovery.json") else {
        return RestoreLintStagedResult {
            restored: false,
            index: None,
        };
    };
    let Ok(bytes) = fs::read(&marker_path) else {
        return RestoreLintStagedResult {
            restored: false,
            index: None,
        };
    };
    let Ok(marker) = serde_json::from_slice::<LintStagedRecoveryMarker>(&bytes) else {
        return RestoreLintStagedResult {
            restored: false,
            index: None,
        };
    };
    let result = restore_new_lint_staged_backup(repo_path, &marker.known_oids);
    if result.restored || result.index.is_none() {
        let _ = fs::remove_file(marker_path);
    }
    result
}

/// 放弃更改前保存选中路径；stash 成功后 Git 会把这些路径恢复到 HEAD。
pub fn stash_paths_for_discard(repo_path: &Path, paths: &[String]) -> Result<String, AppError> {
    let marker = format!("JLGit discard recovery {}", Uuid::new_v4());
    let before: HashSet<String> = list_stash(repo_path)?
        .entries
        .into_iter()
        .map(|entry| entry.oid)
        .collect();
    let mut args = vec![
        "stash".to_string(),
        "push".to_string(),
        "--include-untracked".to_string(),
        "--message".to_string(),
        marker.clone(),
        "--".to_string(),
    ];
    args.extend(paths.iter().cloned());
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    runner::run_git(repo_path, &refs)?;

    let created = list_stash(repo_path)?
        .entries
        .into_iter()
        .any(|entry| !before.contains(&entry.oid) && entry.message.contains(&marker));
    if !created {
        return Err(AppError::new(
            "GIT_RECOVERY_FAILED",
            "未能创建放弃更改的恢复备份，操作已取消",
        ));
    }
    Ok(marker)
}

#[cfg(test)]
mod tests {
    use std::path::Path;
    use std::process::Command;

    use super::{
        apply_stash, is_lint_staged_backup, list_stash, parse_stash_list, stash_paths_for_discard,
        LintStagedRecovery,
    };

    fn git(repo: &Path, args: &[&str]) {
        let status = Command::new("git")
            .args(args)
            .current_dir(repo)
            .status()
            .unwrap();
        assert!(status.success(), "git {args:?} failed");
    }

    #[test]
    fn parses_stash_list_lines() {
        let stdout = "\
stash@{0}\taaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\tlint-staged automatic backup
stash@{1}\tbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\tWIP on main: abc123 feat: demo
";
        let entries = parse_stash_list(stdout);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].index, 0);
        assert_eq!(entries[0].oid, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
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

    #[test]
    fn discard_stash_preserves_tracked_and_untracked_content() {
        let temp = std::env::temp_dir().join(format!("jlgit-discard-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&temp).unwrap();
        git(&temp, &["init", "-q"]);
        git(&temp, &["config", "user.name", "JLGit Test"]);
        git(&temp, &["config", "user.email", "test@example.com"]);
        std::fs::write(temp.join("tracked.txt"), "base").unwrap();
        git(&temp, &["add", "tracked.txt"]);
        git(&temp, &["commit", "-q", "-m", "base"]);

        std::fs::write(temp.join("tracked.txt"), "changed").unwrap();
        std::fs::write(temp.join("untracked.txt"), "new code").unwrap();
        stash_paths_for_discard(
            &temp,
            &["tracked.txt".to_string(), "untracked.txt".to_string()],
        )
        .unwrap();

        assert_eq!(
            std::fs::read_to_string(temp.join("tracked.txt")).unwrap(),
            "base"
        );
        assert!(!temp.join("untracked.txt").exists());
        assert!(list_stash(&temp).unwrap().entries[0]
            .message
            .contains("JLGit discard recovery"));

        apply_stash(&temp, 0).unwrap();
        assert_eq!(
            std::fs::read_to_string(temp.join("tracked.txt")).unwrap(),
            "changed"
        );
        assert_eq!(
            std::fs::read_to_string(temp.join("untracked.txt")).unwrap(),
            "new code"
        );

        std::fs::remove_dir_all(temp).unwrap();
    }

    #[test]
    fn refuses_to_overwrite_pending_recovery_marker() {
        let temp = std::env::temp_dir().join(format!("jlgit-marker-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&temp).unwrap();
        git(&temp, &["init", "-q"]);

        let recovery = LintStagedRecovery::begin(&temp).unwrap();
        let duplicate = LintStagedRecovery::begin(&temp);
        assert!(duplicate.is_err());

        recovery.complete();
        std::fs::remove_dir_all(temp).unwrap();
    }
}
