use serde::Serialize;
use std::fs;
use std::path::Path;
use std::process::Command;

use encoding_rs::Encoding;

use crate::error::AppError;
use crate::git::path::{validate_git_ref, validate_repo_relative_paths};
use crate::git::runner;

const DEFAULT_MAX_BYTES: usize = 1_048_576;
const DEFAULT_ENCODING: &str = "utf-8";
const DEFAULT_STAGED_CONTEXT_MAX_BYTES: usize = 65_536;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffResult {
    pub old_text: String,
    pub new_text: String,
    pub patch: String,
    pub binary: bool,
    pub truncated: bool,
}

/// 供 AI 辅助生成提交文案使用的暂存区 Diff 上下文。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStagedDiffResult {
    pub patch: String,
    pub truncated: bool,
}

/// 读取暂存区相对 HEAD 的 Diff，并限制返回大小，避免将大文件完整交给上层。
pub fn get_staged_diff(
    repo_path: &Path,
    max_bytes: Option<usize>,
) -> Result<GitStagedDiffResult, AppError> {
    let limit = max_bytes
        .unwrap_or(DEFAULT_STAGED_CONTEXT_MAX_BYTES)
        .clamp(1_024, DEFAULT_STAGED_CONTEXT_MAX_BYTES);
    let output = runner::run_git_allow_nonzero(
        repo_path,
        &["diff", "--cached", "--no-ext-diff", "--unified=3"],
    )?;
    let mut patch = output.stdout;
    let truncated = patch.len() > limit;
    if truncated {
        patch.truncate(limit);
    }

    Ok(GitStagedDiffResult { patch, truncated })
}

/// 工作区或暂存区单文件 Diff（含 Monaco 所需两侧文本）
pub fn get_diff(
    repo_path: &Path,
    file_path: &str,
    staged: bool,
    max_bytes: Option<usize>,
    encoding: Option<&str>,
) -> Result<GitDiffResult, AppError> {
    let file_path = file_path.trim();
    if file_path.is_empty() {
        return Err(AppError::new("VALIDATION", "缺少文件路径"));
    }
    validate_repo_relative_paths(&[file_path.to_string()])?;

    let limit = max_bytes.unwrap_or(DEFAULT_MAX_BYTES).max(1024);
    let encoding_id = encoding.unwrap_or(DEFAULT_ENCODING);

    let (old_raw, new_raw) = if staged {
        (
            read_blob(repo_path, &format!("HEAD:{file_path}"))?,
            read_blob(repo_path, &format!(":{file_path}"))?,
        )
    } else {
        let old = read_blob(repo_path, &format!("HEAD:{file_path}"))?;
        let worktree = repo_path.join(file_path);
        let new = if worktree.is_file() {
            Some(read_worktree_bytes(&worktree)?)
        } else {
            // 工作区已删除，或路径不存在
            None
        };
        // 未跟踪文件：HEAD 无 blob，old 为空
        (old, new)
    };

    let binary = looks_binary(old_raw.as_deref()) || looks_binary(new_raw.as_deref());
    if binary {
        let patch = read_patch(repo_path, file_path, staged, limit)?;
        return Ok(GitDiffResult {
            old_text: String::new(),
            new_text: String::new(),
            patch: patch.text,
            binary: true,
            truncated: patch.truncated,
        });
    }

    let (old_text, old_trunc) = bytes_to_text(old_raw.unwrap_or_default(), limit, encoding_id);
    let (new_text, new_trunc) = bytes_to_text(new_raw.unwrap_or_default(), limit, encoding_id);
    let patch = read_patch(repo_path, file_path, staged, limit)?;

    Ok(GitDiffResult {
        old_text,
        new_text,
        patch: patch.text,
        binary: false,
        truncated: old_trunc || new_trunc || patch.truncated,
    })
}

/// 历史提交内单文件相对 parent 的前后对比（Monaco 两侧文本）
///
/// `parent_rev` 为 `None` 表示根提交（无父，相对空树）；
/// 新增 / 删除文件时 old / new 侧会因 `read_blob` 找不到对应路径而自然为空，无需额外按状态特判。
pub fn get_commit_file_diff(
    repo_path: &Path,
    file_path: &str,
    commit_rev: &str,
    parent_rev: Option<&str>,
    max_bytes: Option<usize>,
    encoding: Option<&str>,
) -> Result<GitDiffResult, AppError> {
    let file_path = file_path.trim();
    if file_path.is_empty() {
        return Err(AppError::new("VALIDATION", "缺少文件路径"));
    }
    validate_repo_relative_paths(&[file_path.to_string()])?;
    validate_git_ref(commit_rev)?;
    if let Some(parent) = parent_rev {
        validate_git_ref(parent)?;
    }

    let limit = max_bytes.unwrap_or(DEFAULT_MAX_BYTES).max(1024);
    let encoding_id = encoding.unwrap_or(DEFAULT_ENCODING);

    let old_raw = match parent_rev {
        Some(parent) => read_blob(repo_path, &format!("{parent}:{file_path}"))?,
        None => None,
    };
    let new_raw = read_blob(repo_path, &format!("{commit_rev}:{file_path}"))?;

    let binary = looks_binary(old_raw.as_deref()) || looks_binary(new_raw.as_deref());
    if binary {
        let patch = read_commit_patch(repo_path, file_path, commit_rev, parent_rev, limit)?;
        return Ok(GitDiffResult {
            old_text: String::new(),
            new_text: String::new(),
            patch: patch.text,
            binary: true,
            truncated: patch.truncated,
        });
    }

    let (old_text, old_trunc) = bytes_to_text(old_raw.unwrap_or_default(), limit, encoding_id);
    let (new_text, new_trunc) = bytes_to_text(new_raw.unwrap_or_default(), limit, encoding_id);
    let patch = read_commit_patch(repo_path, file_path, commit_rev, parent_rev, limit)?;

    Ok(GitDiffResult {
        old_text,
        new_text,
        patch: patch.text,
        binary: false,
        truncated: old_trunc || new_trunc || patch.truncated,
    })
}

/// 生成提交内单文件的统一 diff 文本；根提交（无 parent）相对空树生成
fn read_commit_patch(
    repo_path: &Path,
    file_path: &str,
    commit_rev: &str,
    parent_rev: Option<&str>,
    limit: usize,
) -> Result<PatchOut, AppError> {
    let args: Vec<&str> = match parent_rev {
        Some(parent) => vec!["diff", parent, commit_rev, "--", file_path],
        None => vec![
            "diff-tree",
            "-p",
            "--no-commit-id",
            "--root",
            commit_rev,
            "--",
            file_path,
        ],
    };

    let output = runner::run_git_allow_nonzero(repo_path, &args)?;
    let mut text = output.stdout;
    let mut truncated = false;
    if text.len() > limit {
        text.truncate(limit);
        truncated = true;
    }
    Ok(PatchOut { text, truncated })
}

struct PatchOut {
    text: String,
    truncated: bool,
}

fn read_patch(
    repo_path: &Path,
    file_path: &str,
    staged: bool,
    limit: usize,
) -> Result<PatchOut, AppError> {
    let args: Vec<&str> = if staged {
        vec!["diff", "--cached", "--", file_path]
    } else {
        vec!["diff", "--", file_path]
    };

    let output = runner::run_git_allow_nonzero(repo_path, &args)?;
    // diff 对「无差异」也可能非 0；有 stdout 则仍可用
    let mut text = output.stdout;
    let mut truncated = false;
    if text.len() > limit {
        text.truncate(limit);
        truncated = true;
    }

    // 未跟踪文件：普通 diff 为空，用 --no-index 生成（失败则保持空 patch）
    if !staged && text.is_empty() {
        let abs = repo_path.join(file_path);
        if abs.is_file() {
            if let Ok(extra) = diff_untracked(repo_path, &abs, limit) {
                return Ok(extra);
            }
        }
    }

    Ok(PatchOut { text, truncated })
}

fn diff_untracked(repo_path: &Path, abs_file: &Path, limit: usize) -> Result<PatchOut, AppError> {
    // git diff --no-index 在有差异时退出码为 1
    let null_device = if cfg!(windows) { "NUL" } else { "/dev/null" };
    let abs_str = abs_file.to_string_lossy();
    let output = Command::new("git")
        .args([
            "diff",
            "--no-index",
            "--",
            null_device,
            abs_str.as_ref(),
        ])
        .current_dir(repo_path)
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()
        .map_err(|error| {
            AppError::new("GIT_FAILED", "无法生成未跟踪文件 diff").with_details(error.to_string())
        })?;

    let mut text = String::from_utf8_lossy(&output.stdout).into_owned();
    let mut truncated = false;
    if text.len() > limit {
        text.truncate(limit);
        truncated = true;
    }
    Ok(PatchOut { text, truncated })
}

fn read_blob(repo_path: &Path, spec: &str) -> Result<Option<Vec<u8>>, AppError> {
    let (code, stdout, _stderr) = git_bytes(repo_path, &["show", "--textconv", spec])?;
    if code != 0 {
        return Ok(None);
    }
    Ok(Some(stdout))
}

fn read_worktree_bytes(path: &Path) -> Result<Vec<u8>, AppError> {
    fs::read(path).map_err(|error| {
        AppError::new("INTERNAL", "无法读取工作区文件").with_details(error.to_string())
    })
}

fn git_bytes(cwd: &Path, args: &[&str]) -> Result<(i32, Vec<u8>, String), AppError> {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()
        .map_err(|error| {
            AppError::new("GIT_NOT_FOUND", "无法执行 git").with_details(error.to_string())
        })?;

    Ok((
        output.status.code().unwrap_or(-1),
        output.stdout,
        String::from_utf8_lossy(&output.stderr).into_owned(),
    ))
}

fn looks_binary(data: Option<&[u8]>) -> bool {
    let Some(bytes) = data else {
        return false;
    };
    if bytes.is_empty() {
        return false;
    }
    // NUL 或高比例不可打印控制字符 → 视为二进制
    if bytes.contains(&0) {
        return true;
    }
    let sample = &bytes[..bytes.len().min(8_192)];
    let non_text = sample
        .iter()
        .filter(|&&b| b < 0x09 || (b > 0x0d && b < 0x20) || b == 0x7f)
        .count();
    non_text * 100 > sample.len() * 10
}

/// 将前端编码 id 映射到 encoding_rs（BOM 变体与无 BOM 共用解码器）
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

fn bytes_to_text(bytes: Vec<u8>, limit: usize, encoding_id: &str) -> (String, bool) {
    let truncated = bytes.len() > limit;
    let slice = if truncated { &bytes[..limit] } else { &bytes[..] };
    let encoding = resolve_encoding(encoding_id);
    let (cow, _enc_used, _had_errors) = encoding.decode(slice);
    (cow.into_owned(), truncated)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_null_as_binary() {
        assert!(looks_binary(Some(b"a\0b")));
        assert!(!looks_binary(Some(b"hello\nworld")));
    }

    #[test]
    fn truncates_text() {
        let (text, truncated) = bytes_to_text(vec![b'a'; 10], 4, "utf-8");
        assert_eq!(text, "aaaa");
        assert!(truncated);
    }

    #[test]
    fn decodes_gbk_sample() {
        // 「中」的 GBK 字节
        let (text, _) = bytes_to_text(vec![0xD6, 0xD0], 16, "gbk");
        assert_eq!(text, "中");
    }
}
