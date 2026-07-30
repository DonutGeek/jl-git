use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

use crate::error::AppError;
use crate::git::path::validate_repo_relative_paths;
use crate::git::runner;

/// 将路径列表编码为 NUL 分隔（供 `update-index -z --stdin`）
fn encode_nul_paths(paths: &[String]) -> Vec<u8> {
    let mut buf = Vec::new();
    for path in paths {
        buf.extend_from_slice(path.as_bytes());
        buf.push(0);
    }
    buf
}

fn resolve_git_dir(repo_path: &Path) -> Result<std::path::PathBuf, AppError> {
    let output = runner::run_git(repo_path, &["rev-parse", "--git-dir"])?;
    let raw = output.stdout.trim();
    let git_dir = Path::new(raw);
    if git_dir.is_absolute() {
        Ok(git_dir.to_path_buf())
    } else {
        Ok(repo_path.join(git_dir))
    }
}

struct IndexBackup {
    index_path: PathBuf,
    backup_path: PathBuf,
    existed: bool,
}

impl IndexBackup {
    fn create(repo_path: &Path) -> Result<Self, AppError> {
        let git_dir = resolve_git_dir(repo_path)?;
        let index_path = git_dir.join("index");
        let backup_path = git_dir.join(format!("index.jlgit-backup-{}", Uuid::new_v4()));
        let existed = index_path.is_file();
        if existed {
            fs::copy(&index_path, &backup_path).map_err(|error| {
                AppError::new("GIT_RECOVERY_FAILED", "无法备份 Git 暂存区")
                    .with_details(error.to_string())
            })?;
            fs::File::open(&backup_path)
                .and_then(|file| file.sync_all())
                .map_err(|error| {
                    AppError::new("GIT_RECOVERY_FAILED", "无法落盘 Git 暂存区备份")
                        .with_details(error.to_string())
                })?;
        }
        Ok(Self {
            index_path,
            backup_path,
            existed,
        })
    }

    fn restore(&self) -> Result<(), AppError> {
        if self.existed {
            fs::copy(&self.backup_path, &self.index_path).map_err(|error| {
                AppError::new("GIT_RECOVERY_FAILED", "提交失败且无法恢复原暂存区")
                    .with_details(error.to_string())
            })?;
            fs::File::open(&self.index_path)
                .and_then(|file| file.sync_all())
                .map_err(|error| {
                    AppError::new("GIT_RECOVERY_FAILED", "提交失败且暂存区恢复未能落盘")
                        .with_details(error.to_string())
                })?;
        } else if self.index_path.exists() {
            fs::remove_file(&self.index_path).map_err(|error| {
                AppError::new("GIT_RECOVERY_FAILED", "提交失败且无法恢复空暂存区")
                    .with_details(error.to_string())
            })?;
        }
        let _ = fs::remove_file(&self.backup_path);
        Ok(())
    }

    fn complete(self) {
        let _ = fs::remove_file(self.backup_path);
    }
}

/// 合并 / 变基 / cherry-pick 进行中：index 已由 Git 维护，禁止 reset 重建。
fn is_sequencer_in_progress(repo_path: &Path) -> Result<bool, AppError> {
    let git_dir = resolve_git_dir(repo_path)?;
    Ok(git_dir.join("MERGE_HEAD").is_file()
        || git_dir.join("CHERRY_PICK_HEAD").is_file()
        || git_dir.join("rebase-merge").is_dir()
        || git_dir.join("rebase-apply").is_dir())
}

/// ugit 式提交：reset index → 精确 update-index → commit -F -
///
/// - `paths`：本次要纳入提交的全部相对路径（含删除项）
/// - `remove_paths`：其中需 `--force-remove` 的删除 / 重命名旧路径
///
/// 若处于 merge/rebase/cherry-pick：跳过 reset，直接 `git commit` 以正确结束操作并清除 MERGE_HEAD 等。
pub fn commit(
    repo_path: &Path,
    message: &str,
    paths: &[String],
    remove_paths: &[String],
    amend: bool,
) -> Result<String, AppError> {
    if message.trim().is_empty() {
        return Err(AppError::new("VALIDATION", "提交信息不能为空"));
    }

    let sequencer = is_sequencer_in_progress(repo_path)?;

    if !sequencer && paths.is_empty() {
        return Err(AppError::new("VALIDATION", "没有可提交的变更"));
    }

    let index_backup = IndexBackup::create(repo_path)?;
    let lint_recovery = match crate::git::stash::LintStagedRecovery::begin(repo_path) {
        Ok(recovery) => recovery,
        Err(error) => {
            index_backup.complete();
            return Err(error);
        }
    };
    let commit_result = (|| -> Result<(), AppError> {
        if !sequencer {
            validate_repo_relative_paths(paths)?;
            validate_repo_relative_paths(remove_paths)?;

            // 1. 清空暂存区，避免 index 与 UI「待提交」不一致
            runner::run_git(repo_path, &["reset", "--", "."])?;

            let remove_set: HashSet<&str> = remove_paths.iter().map(String::as_str).collect();
            // 删除项只走 force-remove；避免与 --add 同批导致 update-index 失败 / 卡住
            let add_paths: Vec<String> = paths
                .iter()
                .filter(|path| !remove_set.contains(path.as_str()))
                .cloned()
                .collect();

            // 2. 写入增改路径（不加 --verbose，避免大量输出堵管道）
            if !add_paths.is_empty() {
                runner::run_git_with_stdin(
                    repo_path,
                    &[
                        "update-index",
                        "--add",
                        "--remove",
                        "--replace",
                        "-z",
                        "--stdin",
                    ],
                    &encode_nul_paths(&add_paths),
                )?;
            }

            // 3. 删除项 / 重命名旧路径单独 force-remove
            if !remove_paths.is_empty() {
                runner::run_git_with_stdin(
                    repo_path,
                    &[
                        "update-index",
                        "--force-remove",
                        "--replace",
                        "-z",
                        "--stdin",
                    ],
                    &encode_nul_paths(remove_paths),
                )?;
            }
        }

        // 4. 从 stdin 读提交信息（支持多行）；合并中会生成 merge commit 并清除 MERGE_HEAD
        let mut commit_args = vec!["commit"];
        if amend {
            commit_args.push("--amend");
        }
        commit_args.extend_from_slice(&["-F", "-"]);
        runner::run_git_with_stdin(repo_path, &commit_args, message.as_bytes())?;
        Ok(())
    })();

    if let Err(error) = commit_result {
        let lint_restore = lint_recovery.restore_after_failure(repo_path);
        index_backup.restore()?;
        if !lint_restore.restored {
            if let Some(index) = lint_restore.index {
                return Err(AppError::new(
                    "GIT_RECOVERY_FAILED",
                    format!(
                        "提交失败，自动恢复未完成；代码仍保存在 stash@{{{index}}}，请刷新后重试恢复"
                    ),
                )
                .with_details(error.to_string()));
            }
        }
        lint_recovery.complete();
        return Err(error);
    }
    lint_recovery.complete();
    index_backup.complete();

    let head = runner::run_git(repo_path, &["rev-parse", "HEAD"])?;
    Ok(head.stdout.trim().to_string())
}

/// 仅修改 HEAD 提交信息（不改 tree / 不重建 index）
pub fn amend_message(repo_path: &Path, rev: &str, message: &str) -> Result<String, AppError> {
    if message.trim().is_empty() {
        return Err(AppError::new("VALIDATION", "提交信息不能为空"));
    }
    if rev.trim().is_empty() || rev.contains('\0') || rev.starts_with('-') {
        return Err(AppError::new("VALIDATION", "非法提交引用"));
    }
    if is_sequencer_in_progress(repo_path)? {
        return Err(AppError::new(
            "VALIDATION",
            "合并或变基进行中，无法修改提交信息",
        ));
    }

    let head = runner::run_git(repo_path, &["rev-parse", "HEAD"])?;
    let target = runner::run_git(repo_path, &["rev-parse", rev])?;
    if head.stdout.trim() != target.stdout.trim() {
        return Err(AppError::new("VALIDATION", "只能修改当前 HEAD 提交的信息"));
    }

    let index_backup = IndexBackup::create(repo_path)?;
    let lint_recovery = match crate::git::stash::LintStagedRecovery::begin(repo_path) {
        Ok(recovery) => recovery,
        Err(error) => {
            index_backup.complete();
            return Err(error);
        }
    };
    let amend_result = runner::run_git_with_stdin(
        repo_path,
        &["commit", "--amend", "-F", "-"],
        message.as_bytes(),
    );
    if let Err(error) = amend_result {
        let lint_restore = lint_recovery.restore_after_failure(repo_path);
        index_backup.restore()?;
        if !lint_restore.restored {
            if let Some(index) = lint_restore.index {
                return Err(AppError::new(
                    "GIT_RECOVERY_FAILED",
                    format!(
                        "修改提交信息失败，自动恢复未完成；代码仍保存在 stash@{{{index}}}，请刷新后重试恢复"
                    ),
                )
                .with_details(error.to_string()));
            }
        }
        lint_recovery.complete();
        return Err(error);
    }
    lint_recovery.complete();
    index_backup.complete();

    let next_head = runner::run_git(repo_path, &["rev-parse", "HEAD"])?;
    Ok(next_head.stdout.trim().to_string())
}

#[cfg(test)]
mod tests {
    use std::path::Path;
    use std::process::Command;

    use super::commit;

    fn git(repo: &Path, args: &[&str]) -> String {
        let output = Command::new("git")
            .args(args)
            .current_dir(repo)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "git {args:?} failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8_lossy(&output.stdout).into_owned()
    }

    #[cfg(unix)]
    #[test]
    fn restores_original_index_when_commit_hook_fails() {
        use std::os::unix::fs::PermissionsExt;

        let temp = std::env::temp_dir().join(format!("jlgit-commit-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&temp).unwrap();
        git(&temp, &["init", "-q"]);
        git(&temp, &["config", "user.name", "JLGit Test"]);
        git(&temp, &["config", "user.email", "test@example.com"]);
        std::fs::write(temp.join("a.txt"), "base a").unwrap();
        std::fs::write(temp.join("b.txt"), "base b").unwrap();
        git(&temp, &["add", "a.txt", "b.txt"]);
        git(&temp, &["commit", "-q", "-m", "base"]);

        std::fs::write(temp.join("a.txt"), "changed a").unwrap();
        std::fs::write(temp.join("b.txt"), "changed b").unwrap();
        git(&temp, &["add", "b.txt"]);
        let before = git(&temp, &["diff", "--cached", "--name-only"]);

        let hook = temp.join(".git/hooks/pre-commit");
        std::fs::write(&hook, "#!/bin/sh\nexit 1\n").unwrap();
        let mut permissions = std::fs::metadata(&hook).unwrap().permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(&hook, permissions).unwrap();

        let result = commit(&temp, "test commit", &["a.txt".to_string()], &[], false);
        assert!(result.is_err());

        let after = git(&temp, &["diff", "--cached", "--name-only"]);
        assert_eq!(after, before);
        assert_eq!(
            std::fs::read_to_string(temp.join("a.txt")).unwrap(),
            "changed a"
        );
        assert_eq!(
            std::fs::read_to_string(temp.join("b.txt")).unwrap(),
            "changed b"
        );

        std::fs::remove_dir_all(temp).unwrap();
    }
}
