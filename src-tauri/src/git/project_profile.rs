use serde::Serialize;
use std::fs;
use std::path::Path;

use crate::error::AppError;
use crate::git::path::{normalize_existing_dir, require_git_toplevel};

const MAX_FILE_BYTES: usize = 12_288;
const MAX_TOTAL_BYTES: usize = 40_960;

/// 用于 AI 生成项目简介的轻量仓库快照
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectProfileFile {
    pub name: String,
    pub content: String,
    pub truncated: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectProfileSnapshot {
    pub folder_name: String,
    pub files: Vec<ProjectProfileFile>,
}

/// 候选说明文件（仓库根，按优先级）
const CANDIDATE_FILES: &[&str] = &[
    "README.md",
    "README.MD",
    "Readme.md",
    "README",
    "readme.md",
    "package.json",
    "Cargo.toml",
    "pyproject.toml",
    "go.mod",
    "composer.json",
];

/// 读取仓库根 README / 清单文件，供前端生成项目简介
pub fn collect_snapshot(path: &str) -> Result<ProjectProfileSnapshot, AppError> {
    let dir = normalize_existing_dir(path)?;
    let repo = require_git_toplevel(&dir)?;
    let folder_name = repo
        .file_name()
        .map(|value| value.to_string_lossy().into_owned())
        .unwrap_or_else(|| "Repository".to_string());

    let mut files = Vec::new();
    let mut total = 0_usize;
    let mut seen = std::collections::HashSet::<String>::new();

    for name in CANDIDATE_FILES {
        if total >= MAX_TOTAL_BYTES {
            break;
        }
        let key = name.to_ascii_lowercase();
        // README 多大小写只取一份
        if key.starts_with("readme") && seen.iter().any(|item| item.starts_with("readme")) {
            continue;
        }
        if !seen.insert(key) {
            continue;
        }

        let file_path = repo.join(name);
        if !file_path.is_file() {
            continue;
        }

        let Some(entry) = read_text_file(&file_path, name, MAX_TOTAL_BYTES - total)? else {
            continue;
        };
        total = total.saturating_add(entry.content.len());
        files.push(entry);
    }

    Ok(ProjectProfileSnapshot { folder_name, files })
}

fn read_text_file(
    path: &Path,
    display_name: &str,
    remaining_budget: usize,
) -> Result<Option<ProjectProfileFile>, AppError> {
    let bytes = fs::read(path).map_err(|error| {
        AppError::new("INTERNAL", "无法读取项目文件").with_details(error.to_string())
    })?;

    // 跳过明显二进制
    if bytes.iter().take(512).any(|byte| *byte == 0) {
        return Ok(None);
    }

    let limit = MAX_FILE_BYTES.min(remaining_budget).max(1);
    let truncated = bytes.len() > limit;
    let slice = if truncated {
        &bytes[..limit]
    } else {
        &bytes[..]
    };
    let content = String::from_utf8_lossy(slice).into_owned();
    if content.trim().is_empty() {
        return Ok(None);
    }

    Ok(Some(ProjectProfileFile {
        name: display_name.to_string(),
        content,
        truncated,
    }))
}
