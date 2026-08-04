use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

use crate::error::AppError;
use crate::git::path::{normalize_existing_dir, require_git_toplevel};

const MAX_FILE_BYTES: usize = 8_192;
const MAX_MANIFEST_FILE_BYTES: usize = 4_096;
const MAX_TOTAL_BYTES: usize = 65_536;
const MAX_SOURCE_FILES: usize = 12;
const MAX_SOURCE_CANDIDATES: usize = 240;
const MAX_MANIFEST_FILES: usize = 6;
const MAX_TREE_ENTRIES: usize = 120;
const MAX_SCAN_DEPTH: usize = 4;

/// 用于 AI 生成项目详情的受限代码画像
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
    pub structure: Vec<String>,
    pub files: Vec<ProjectProfileFile>,
}

/// 候选依赖清单（仓库根，按优先级）
const MANIFEST_FILES: &[&str] = &[
    "package.json",
    "Cargo.toml",
    "pyproject.toml",
    "go.mod",
    "composer.json",
    "pom.xml",
    "build.gradle",
    "build.gradle.kts",
    "Gemfile",
    "requirements.txt",
];

const README_FILES: &[&str] = &["README.md", "README.MD", "Readme.md", "README", "readme.md"];

/// 读取项目入口、业务模块、依赖清单与少量说明，供前端生成项目详情。
pub fn collect_snapshot(path: &str) -> Result<ProjectProfileSnapshot, AppError> {
    let dir = normalize_existing_dir(path)?;
    let repo = require_git_toplevel(&dir)?;
    let folder_name = repo
        .file_name()
        .map(|value| value.to_string_lossy().into_owned())
        .unwrap_or_else(|| "Repository".to_string());

    let mut files = Vec::new();
    let mut total = 0_usize;
    for name in MANIFEST_FILES.iter().take(MAX_MANIFEST_FILES) {
        if total >= MAX_TOTAL_BYTES {
            break;
        }
        let file_path = repo.join(name);
        if !file_path.is_file() {
            continue;
        }

        let Some(entry) = read_text_file_with_limit(
            &file_path,
            name,
            MAX_TOTAL_BYTES - total,
            MAX_MANIFEST_FILE_BYTES,
        )?
        else {
            continue;
        };
        total = total.saturating_add(entry.content.len());
        files.push(entry);
    }

    let structure = collect_structure(&repo);
    let source_files = collect_source_files(&repo);
    for path in source_files {
        if total >= MAX_TOTAL_BYTES {
            break;
        }
        let Some(name) = relative_display_name(&repo, &path) else {
            continue;
        };
        let Some(entry) = read_text_file(&path, &name, MAX_TOTAL_BYTES - total)? else {
            continue;
        };
        total = total.saturating_add(entry.content.len());
        files.push(entry);
    }

    // README 只作业务代码与清单之外的补充，避免其占用分析实际逻辑的预算。
    for name in README_FILES {
        if total >= MAX_TOTAL_BYTES {
            break;
        }
        let file_path = repo.join(name);
        if !file_path.is_file() {
            continue;
        }
        let Some(entry) = read_text_file(&file_path, name, MAX_TOTAL_BYTES - total)? else {
            continue;
        };
        files.push(entry);
        break;
    }

    Ok(ProjectProfileSnapshot {
        folder_name,
        structure,
        files,
    })
}

fn collect_structure(repo: &Path) -> Vec<String> {
    let mut paths = Vec::new();
    collect_paths(repo, repo, 0, &mut paths, MAX_TREE_ENTRIES, false);
    paths
        .into_iter()
        .filter_map(|path| {
            relative_display_name(repo, &path).map(|name| {
                if path.is_dir() {
                    format!("{name}/")
                } else {
                    name
                }
            })
        })
        .collect()
}

fn collect_source_files(repo: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    collect_paths(repo, repo, 0, &mut files, MAX_SOURCE_CANDIDATES, true);
    files.sort_by_key(|path| source_priority(repo, path));
    files.truncate(MAX_SOURCE_FILES);
    files
}

/// 优先让模型看到应用入口、路由和领域能力，避免被纯展示组件淹没。
fn source_priority(repo: &Path, path: &Path) -> (u8, String) {
    let relative = relative_display_name(repo, path).unwrap_or_default();
    let normalized = relative.to_ascii_lowercase();
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default();
    let priority = if matches!(
        file_name,
        "main.rs" | "main.ts" | "main.tsx" | "app.ts" | "app.tsx" | "index.ts" | "index.tsx"
    ) {
        0
    } else if [
        "route",
        "router",
        "page",
        "feature",
        "service",
        "command",
        "controller",
        "handler",
        "usecase",
        "domain",
        "api",
    ]
    .iter()
    .any(|keyword| normalized.contains(keyword))
    {
        1
    } else if normalized.contains("component") || normalized.contains("view") {
        3
    } else {
        2
    };

    (priority, normalized)
}

fn collect_paths(
    repo: &Path,
    directory: &Path,
    depth: usize,
    results: &mut Vec<PathBuf>,
    limit: usize,
    sources_only: bool,
) {
    if depth >= MAX_SCAN_DEPTH || results.len() >= limit {
        return;
    }
    let Ok(read_dir) = fs::read_dir(directory) else {
        return;
    };
    let mut entries = read_dir.flatten().collect::<Vec<_>>();
    entries.sort_by_key(|entry| entry.file_name());

    for entry in entries {
        if results.len() >= limit {
            break;
        }
        let path = entry.path();
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if should_skip(&name) {
            continue;
        }
        if path.is_dir() {
            if !sources_only {
                results.push(path.clone());
            }
            collect_paths(repo, &path, depth + 1, results, limit, sources_only);
        } else if sources_only {
            if is_source_file(&path) && !is_test_file(&path) {
                results.push(path);
            }
        } else {
            results.push(path);
        }
    }
}

fn should_skip(name: &str) -> bool {
    matches!(
        name,
        ".git"
            | "node_modules"
            | "target"
            | "dist"
            | "build"
            | "coverage"
            | ".next"
            | ".nuxt"
            | ".venv"
            | "vendor"
            | "Pods"
            | "DerivedData"
    ) || name.starts_with('.')
        || name.eq_ignore_ascii_case(".env")
        || name.to_ascii_lowercase().starts_with(".env.")
}

fn is_source_file(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|extension| extension.to_str()),
        Some(
            "rs" | "ts"
                | "tsx"
                | "js"
                | "jsx"
                | "vue"
                | "svelte"
                | "py"
                | "go"
                | "java"
                | "kt"
                | "kts"
                | "rb"
                | "php"
                | "cs"
                | "swift"
        )
    )
}

fn is_test_file(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.contains(".test.") || name.contains(".spec."))
}

fn relative_display_name(repo: &Path, path: &Path) -> Option<String> {
    path.strip_prefix(repo)
        .ok()
        .map(|relative| relative.to_string_lossy().into_owned())
}

fn read_text_file(
    path: &Path,
    display_name: &str,
    remaining_budget: usize,
) -> Result<Option<ProjectProfileFile>, AppError> {
    read_text_file_with_limit(path, display_name, remaining_budget, MAX_FILE_BYTES)
}

fn read_text_file_with_limit(
    path: &Path,
    display_name: &str,
    remaining_budget: usize,
    file_limit: usize,
) -> Result<Option<ProjectProfileFile>, AppError> {
    let bytes = fs::read(path).map_err(|error| {
        AppError::new("INTERNAL", "无法读取项目文件").with_details(error.to_string())
    })?;

    // 跳过明显二进制
    if bytes.iter().take(512).any(|byte| *byte == 0) {
        return Ok(None);
    }

    let limit = file_limit.min(remaining_budget).max(1);
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

#[cfg(test)]
mod tests {
    use super::{is_source_file, is_test_file, should_skip, source_priority};
    use std::path::Path;

    #[test]
    fn excludes_dependency_build_and_secret_paths() {
        assert!(should_skip("node_modules"));
        assert!(should_skip("dist"));
        assert!(should_skip(".env"));
        assert!(should_skip(".env.production"));
        assert!(should_skip(".git"));
    }

    #[test]
    fn keeps_supported_business_source_files() {
        assert!(is_source_file(Path::new("src/routes/dashboard.tsx")));
        assert!(is_source_file(Path::new(
            "src-tauri/src/commands/project.rs"
        )));
        assert!(is_source_file(Path::new("api/main.py")));
        assert!(!is_source_file(Path::new("pnpm-lock.yaml")));
        assert!(is_test_file(Path::new("src/app.spec.ts")));
    }

    #[test]
    fn prioritizes_application_logic_over_components() {
        let repo = Path::new("/repo");
        assert!(
            source_priority(repo, Path::new("/repo/src/routes/projects.tsx"))
                < source_priority(repo, Path::new("/repo/src/components/Button.tsx"))
        );
    }
}
