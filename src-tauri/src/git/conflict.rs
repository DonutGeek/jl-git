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
    validate_repo_relative_paths(&[file_path.to_string()])?;

    let which = match side {
        ConflictSide::Ours => "--ours",
        ConflictSide::Theirs => "--theirs",
    };
    runner::run_git(repo_path, &["checkout", which, "--", file_path])?;
    runner::run_git(repo_path, &["add", "--", file_path])?;
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
    validate_repo_relative_paths(&[file_path.to_string()])?;

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
    validate_repo_relative_paths(&[file_path.to_string()])?;

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
    validate_repo_relative_paths(&[file_path.to_string()])?;
    runner::run_git(repo_path, &["add", "--", file_path])?;
    Ok(OkResult { ok: true })
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
