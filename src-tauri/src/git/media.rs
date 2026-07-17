use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;
use std::path::Path;

use crate::error::AppError;
use crate::git::diff::{read_blob, read_worktree_bytes};
use crate::git::path::{validate_git_ref, validate_repo_relative_paths};

/// 图片预览默认上限（大于文本 diff 的 1MB）
pub(crate) const DEFAULT_MEDIA_MAX_BYTES: usize = 5_242_880;
const MEDIA_MAX_BYTES_CAP: usize = 8_388_608;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFileMedia {
    /// 该侧是否存在可读内容
    pub present: bool,
    /// image | unsupported
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base64: Option<String>,
    pub size: usize,
    pub truncated: bool,
}

/// 读取工作区 / 索引 / 指定 rev 下的单文件媒体内容（base64）。
///
/// `source`：`worktree` | `index` | 合法 Git rev（如 `HEAD`、commit）
pub fn get_file_media(
    repo_path: &Path,
    file_path: &str,
    source: &str,
    max_bytes: Option<usize>,
) -> Result<GitFileMedia, AppError> {
    let file_path = file_path.trim();
    if file_path.is_empty() {
        return Err(AppError::new("VALIDATION", "缺少文件路径"));
    }
    validate_repo_relative_paths(&[file_path.to_string()])?;

    let source = source.trim();
    if source.is_empty() {
        return Err(AppError::new("VALIDATION", "缺少媒体来源"));
    }

    let limit = max_bytes
        .unwrap_or(DEFAULT_MEDIA_MAX_BYTES)
        .clamp(1_024, MEDIA_MAX_BYTES_CAP);

    let raw = match source {
        "worktree" => {
            let worktree = repo_path.join(file_path);
            if !worktree.is_file() {
                return Ok(empty_media());
            }
            Some(read_worktree_bytes(&worktree)?)
        }
        "index" => {
            if let Some(bytes) = read_blob(repo_path, &format!(":0:{file_path}"))? {
                Some(bytes)
            } else {
                read_blob(repo_path, &format!(":{file_path}"))?
            }
        }
        rev => {
            validate_git_ref(rev)?;
            read_blob(repo_path, &format!("{rev}:{file_path}"))?
        }
    };

    let Some(bytes) = raw else {
        return Ok(empty_media());
    };

    let size = bytes.len();
    let truncated = size > limit;
    let slice = if truncated { &bytes[..limit] } else { &bytes[..] };
    let mime = mime_from_path(file_path);
    let kind = if mime.is_some() {
        "image".to_string()
    } else {
        "unsupported".to_string()
    };

    // 非图片不传 base64，避免大文件白占 IPC
    let base64 = if kind == "image" {
        Some(STANDARD.encode(slice))
    } else {
        None
    };

    Ok(GitFileMedia {
        present: true,
        kind,
        mime: mime.map(str::to_string),
        base64,
        size,
        truncated,
    })
}

fn empty_media() -> GitFileMedia {
    GitFileMedia {
        present: false,
        kind: "unsupported".to_string(),
        mime: None,
        base64: None,
        size: 0,
        truncated: false,
    }
}

fn mime_from_path(path: &str) -> Option<&'static str> {
    let ext = Path::new(path)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())?;
    match ext.as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "bmp" => Some("image/bmp"),
        "svg" => Some("image/svg+xml"),
        "ico" => Some("image/x-icon"),
        "avif" => Some("image/avif"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_image_mime() {
        assert_eq!(mime_from_path("a/b.PNG"), Some("image/png"));
        assert_eq!(mime_from_path("x.webp"), Some("image/webp"));
        assert_eq!(mime_from_path("x.bin"), None);
    }
}
