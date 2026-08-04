use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

use encoding_rs::Encoding;

use crate::error::AppError;
use crate::git::diff::{bytes_to_text, looks_binary, read_worktree_bytes, DEFAULT_MAX_BYTES};
use crate::git::path::validate_repo_relative_paths;
use crate::git::runner;

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ConflictSide {
    Ours,
    Theirs,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitWorktreeFileResult {
    pub text: String,
    pub binary: bool,
    pub truncated: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OkResult {
    pub ok: bool,
}

/// 整文件采用 ours/theirs，并 `git add` 标记已解决。
pub fn take_side(
    repo_path: &Path,
    file_path: &str,
    side: ConflictSide,
) -> Result<OkResult, AppError> {
    let file_path = file_path.trim();
    if file_path.is_empty() {
        return Err(AppError::new("VALIDATION", "缺少文件路径"));
    }
    validate_conflict_file_path(file_path)?;

    let stages = unmerged_stages(repo_path, file_path)?;
    if stages.is_empty() {
        return Err(AppError::new("VALIDATION", "该文件当前不处于冲突状态"));
    }

    let (which, stage) = match side {
        ConflictSide::Ours => ("--ours", 2),
        ConflictSide::Theirs => ("--theirs", 3),
    };
    if stages.contains(&stage) {
        runner::run_git(repo_path, &["checkout", which, "--", file_path])?;
        runner::run_git(repo_path, &["add", "--", file_path])?;
    } else {
        // modify/delete、双方删除等冲突中，目标侧没有 stage 版本；选择它即表示删除文件。
        runner::run_git(
            repo_path,
            &["rm", "--force", "--ignore-unmatch", "--", file_path],
        )?;
    }
    Ok(OkResult { ok: true })
}

/// 读取工作区文本（含冲突标记）。
pub fn read_worktree_file(
    repo_path: &Path,
    file_path: &str,
    max_bytes: Option<usize>,
    encoding: Option<&str>,
) -> Result<GitWorktreeFileResult, AppError> {
    let file_path = file_path.trim();
    if file_path.is_empty() {
        return Err(AppError::new("VALIDATION", "缺少文件路径"));
    }
    validate_conflict_file_path(file_path)?;

    let abs = resolve_under_repo(repo_path, file_path)?;
    if !abs.is_file() {
        return Err(AppError::new("NOT_FOUND", "工作区文件不存在"));
    }

    let limit = max_bytes.unwrap_or(DEFAULT_MAX_BYTES).max(1024);
    let encoding_id = encoding.unwrap_or("utf-8");
    let bytes = read_worktree_bytes(&abs)?;
    let binary = looks_binary(Some(&bytes));
    if binary {
        return Ok(GitWorktreeFileResult {
            text: String::new(),
            binary: true,
            truncated: false,
        });
    }
    let (text, truncated) = bytes_to_text(bytes, limit, encoding_id);
    Ok(GitWorktreeFileResult {
        text,
        binary: false,
        truncated,
    })
}

/// 将解决后的文本写回工作区；`stage=true` 时再 `git add`。
pub fn write_worktree_file(
    repo_path: &Path,
    file_path: &str,
    content: &str,
    stage: bool,
    encoding: Option<&str>,
) -> Result<OkResult, AppError> {
    let file_path = file_path.trim();
    if file_path.is_empty() {
        return Err(AppError::new("VALIDATION", "缺少文件路径"));
    }
    validate_conflict_file_path(file_path)?;

    let abs = resolve_under_repo(repo_path, file_path)?;
    // 仅允许写已存在路径下的文件，或父目录已在仓库内
    if let Some(parent) = abs.parent() {
        if !parent.exists() {
            return Err(AppError::new("VALIDATION", "目标目录不存在"));
        }
    }

    let encoding_id = encoding.unwrap_or("utf-8");
    let bytes = encode_text(content, encoding_id)?;
    fs::write(&abs, bytes).map_err(|error| {
        AppError::new("INTERNAL", "无法写入工作区文件").with_details(error.to_string())
    })?;

    if stage {
        runner::run_git(repo_path, &["add", "--", file_path])?;
    }
    Ok(OkResult { ok: true })
}

/// 仅 `git add` 标记冲突已解决（调用方需保证标记已清除）。
pub fn mark_resolved(repo_path: &Path, file_path: &str) -> Result<OkResult, AppError> {
    let file_path = file_path.trim();
    if file_path.is_empty() {
        return Err(AppError::new("VALIDATION", "缺少文件路径"));
    }
    validate_conflict_file_path(file_path)?;
    if unmerged_stages(repo_path, file_path)?.is_empty() {
        return Err(AppError::new("VALIDATION", "该文件当前不处于冲突状态"));
    }
    runner::run_git(repo_path, &["add", "--", file_path])?;
    Ok(OkResult { ok: true })
}

/** 返回冲突 index 中存在的 stage 编号（1=base、2=ours、3=theirs）。 */
fn unmerged_stages(repo_path: &Path, file_path: &str) -> Result<Vec<u8>, AppError> {
    let output = runner::run_git(repo_path, &["ls-files", "-u", "--", file_path])?;
    let mut stages = Vec::new();
    for line in output.stdout.lines() {
        let metadata = line
            .split_once('\t')
            .map(|(metadata, _)| metadata)
            .unwrap_or(line);
        let Some(raw_stage) = metadata.split_whitespace().nth(2) else {
            continue;
        };
        if let Ok(stage) = raw_stage.parse::<u8>() {
            stages.push(stage);
        }
    }
    Ok(stages)
}

fn validate_conflict_file_path(file_path: &str) -> Result<(), AppError> {
    validate_repo_relative_paths(&[file_path.to_string()])?;
    if file_path == "." {
        return Err(AppError::new("VALIDATION", "冲突操作必须指定单个文件"));
    }
    Ok(())
}

fn resolve_under_repo(repo_path: &Path, file_path: &str) -> Result<std::path::PathBuf, AppError> {
    let abs = repo_path.join(file_path);
    let canonical_repo = fs::canonicalize(repo_path).map_err(|error| {
        AppError::new("INVALID_PATH", "无法规范化仓库路径").with_details(error.to_string())
    })?;

    // 文件可能尚不存在（少见）；规范化父目录再拼接文件名
    let candidate = if abs.exists() {
        fs::canonicalize(&abs).map_err(|error| {
            AppError::new("INVALID_PATH", "无法规范化文件路径").with_details(error.to_string())
        })?
    } else {
        let parent = abs
            .parent()
            .ok_or_else(|| AppError::new("VALIDATION", "非法文件路径"))?;
        let canon_parent = fs::canonicalize(parent).map_err(|error| {
            AppError::new("INVALID_PATH", "无法规范化父目录").with_details(error.to_string())
        })?;
        let name = abs
            .file_name()
            .ok_or_else(|| AppError::new("VALIDATION", "非法文件路径"))?;
        canon_parent.join(name)
    };

    if !candidate.starts_with(&canonical_repo) {
        return Err(AppError::new("VALIDATION", "路径必须位于仓库根目录下"));
    }
    Ok(candidate)
}

fn encode_text(content: &str, encoding_id: &str) -> Result<Vec<u8>, AppError> {
    let encoding = resolve_encoding(encoding_id);
    if encoding == encoding_rs::UTF_8 {
        return Ok(content.as_bytes().to_vec());
    }
    let (cow, _enc, errors) = encoding.encode(content);
    if errors {
        return Err(AppError::new(
            "VALIDATION",
            "内容无法按所选编码完整写入，请改用 UTF-8",
        ));
    }
    Ok(cow.into_owned())
}

fn resolve_encoding(encoding_id: &str) -> &'static Encoding {
    match encoding_id {
        "utf-8" | "utf-8-bom" => encoding_rs::UTF_8,
        "gb2312" | "gbk" => encoding_rs::GBK,
        "utf-16le" | "utf-16le-bom" => encoding_rs::UTF_16LE,
        "utf-16be" | "utf-16be-bom" => encoding_rs::UTF_16BE,
        "windows-1252" => encoding_rs::WINDOWS_1252,
        "windows-1255" => encoding_rs::WINDOWS_1255,
        "big5" => encoding_rs::BIG5,
        "shift_jis" => encoding_rs::SHIFT_JIS,
        "euc-kr" => encoding_rs::EUC_KR,
        "iso-8859-1" => encoding_rs::WINDOWS_1252,
        _ => Encoding::for_label(encoding_id.as_bytes()).unwrap_or(encoding_rs::UTF_8),
    }
}

#[cfg(test)]
mod tests {
    use std::path::{Path, PathBuf};
    use std::process::Command;

    use super::{mark_resolved, take_side, ConflictSide};
    use crate::git::status;

    fn git(repo: &Path, args: &[&str]) {
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
    }

    fn git_fails(repo: &Path, args: &[&str]) {
        let status = Command::new("git")
            .args(args)
            .current_dir(repo)
            .status()
            .unwrap();
        assert!(!status.success(), "git {args:?} unexpectedly succeeded");
    }

    fn test_repo() -> PathBuf {
        let repo = std::env::temp_dir().join(format!("jlgit-conflict-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&repo).unwrap();
        git(&repo, &["init", "-q"]);
        git(&repo, &["config", "user.name", "JLGit Test"]);
        git(&repo, &["config", "user.email", "test@example.com"]);
        repo
    }

    fn current_branch(repo: &Path) -> String {
        let output = Command::new("git")
            .args(["branch", "--show-current"])
            .current_dir(repo)
            .output()
            .unwrap();
        String::from_utf8(output.stdout).unwrap().trim().to_string()
    }

    #[test]
    fn takes_existing_side_and_stages_the_resolution() {
        let repo = test_repo();
        std::fs::write(repo.join("conflict.txt"), "base\n").unwrap();
        git(&repo, &["add", "conflict.txt"]);
        git(&repo, &["commit", "-q", "-m", "base"]);
        let main = current_branch(&repo);

        git(&repo, &["checkout", "-q", "-b", "feature"]);
        std::fs::write(repo.join("conflict.txt"), "theirs\n").unwrap();
        git(&repo, &["commit", "-qam", "theirs"]);
        git(&repo, &["checkout", "-q", &main]);
        std::fs::write(repo.join("conflict.txt"), "ours\n").unwrap();
        git(&repo, &["commit", "-qam", "ours"]);
        git_fails(&repo, &["merge", "feature"]);

        take_side(&repo, "conflict.txt", ConflictSide::Ours).unwrap();

        assert_eq!(
            std::fs::read_to_string(repo.join("conflict.txt")).unwrap(),
            "ours\n"
        );
        assert!(!status::has_unmerged_entries(
            &status::get_status(&repo).unwrap()
        ));
        std::fs::remove_dir_all(repo).unwrap();
    }

    #[test]
    fn takes_deleted_side_for_modify_delete_conflict() {
        let repo = test_repo();
        std::fs::write(repo.join("conflict.txt"), "base\n").unwrap();
        git(&repo, &["add", "conflict.txt"]);
        git(&repo, &["commit", "-q", "-m", "base"]);
        let main = current_branch(&repo);

        git(&repo, &["checkout", "-q", "-b", "feature"]);
        git(&repo, &["rm", "-q", "conflict.txt"]);
        git(&repo, &["commit", "-q", "-m", "delete"]);
        git(&repo, &["checkout", "-q", &main]);
        std::fs::write(repo.join("conflict.txt"), "ours\n").unwrap();
        git(&repo, &["commit", "-qam", "ours"]);
        git_fails(&repo, &["merge", "feature"]);

        take_side(&repo, "conflict.txt", ConflictSide::Theirs).unwrap();

        assert!(!repo.join("conflict.txt").exists());
        assert!(!status::has_unmerged_entries(
            &status::get_status(&repo).unwrap()
        ));
        std::fs::remove_dir_all(repo).unwrap();
    }

    #[test]
    fn takes_theirs_for_add_add_conflict() {
        let repo = test_repo();
        std::fs::write(repo.join("base.txt"), "base\n").unwrap();
        git(&repo, &["add", "base.txt"]);
        git(&repo, &["commit", "-q", "-m", "base"]);
        let main = current_branch(&repo);

        git(&repo, &["checkout", "-q", "-b", "feature"]);
        std::fs::write(repo.join("new.txt"), "theirs\n").unwrap();
        git(&repo, &["add", "new.txt"]);
        git(&repo, &["commit", "-q", "-m", "theirs"]);
        git(&repo, &["checkout", "-q", &main]);
        std::fs::write(repo.join("new.txt"), "ours\n").unwrap();
        git(&repo, &["add", "new.txt"]);
        git(&repo, &["commit", "-q", "-m", "ours"]);
        git_fails(&repo, &["merge", "feature"]);

        take_side(&repo, "new.txt", ConflictSide::Theirs).unwrap();

        assert_eq!(
            std::fs::read_to_string(repo.join("new.txt")).unwrap(),
            "theirs\n"
        );
        assert!(!status::has_unmerged_entries(
            &status::get_status(&repo).unwrap()
        ));
        std::fs::remove_dir_all(repo).unwrap();
    }

    #[test]
    fn rejects_marking_a_non_conflicted_file_as_resolved() {
        let repo = test_repo();
        std::fs::write(repo.join("clean.txt"), "clean\n").unwrap();
        git(&repo, &["add", "clean.txt"]);
        git(&repo, &["commit", "-q", "-m", "base"]);

        assert!(mark_resolved(&repo, "clean.txt").is_err());
        assert!(take_side(&repo, ".", ConflictSide::Ours).is_err());
        std::fs::remove_dir_all(repo).unwrap();
    }
}
