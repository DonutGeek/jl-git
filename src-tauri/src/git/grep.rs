use serde::Serialize;
use std::path::Path;

use crate::error::AppError;
use crate::git::path::validate_repo_relative_paths;
use crate::git::runner;

const MAX_PATTERN_LEN: usize = 200;
const DEFAULT_MAX_MATCHES: usize = 40;
const HARD_MAX_MATCHES: usize = 80;
const MAX_LINE_CHARS: usize = 240;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GrepMatch {
    pub path: String,
    pub line: u32,
    pub text: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GrepResult {
    pub matches: Vec<GrepMatch>,
    pub truncated: bool,
}

/// 在仓库内只读搜索文本（`git grep -F -n -I`，固定字符串，跳过二进制）。
pub fn grep_code(
    repo_root: &Path,
    pattern: &str,
    pathspec: Option<&str>,
    max_matches: Option<u32>,
) -> Result<GrepResult, AppError> {
    let pattern = pattern.trim();
    if pattern.is_empty() {
        return Err(AppError::new("VALIDATION", "搜索关键字不能为空"));
    }
    if pattern.len() > MAX_PATTERN_LEN || pattern.contains('\0') {
        return Err(AppError::new("VALIDATION", "非法搜索关键字"));
    }

    let limit = max_matches
        .map(|value| value as usize)
        .unwrap_or(DEFAULT_MAX_MATCHES)
        .clamp(1, HARD_MAX_MATCHES);

    let mut args = vec![
        "grep".to_string(),
        "-F".to_string(),
        "-n".to_string(),
        "-I".to_string(),
        "-e".to_string(),
        pattern.to_string(),
        "--".to_string(),
    ];
    if let Some(raw) = pathspec.map(str::trim).filter(|value| !value.is_empty()) {
        validate_repo_relative_paths(&[raw.to_string()])?;
        args.push(raw.to_string());
    }

    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let output = runner::run_git_allow_nonzero(repo_root, &arg_refs)?;
    // 0=有命中；1=无命中；其它为失败
    if output.code != 0 && output.code != 1 {
        return Err(AppError::new("GIT_FAILED", "代码搜索失败").with_details(output.stderr));
    }

    let mut matches = Vec::new();
    let mut truncated = false;
    for line in output.stdout.lines() {
        if matches.len() >= limit {
            truncated = true;
            break;
        }
        if let Some(parsed) = parse_grep_line(line) {
            matches.push(parsed);
        }
    }

    Ok(GrepResult { matches, truncated })
}

fn parse_grep_line(line: &str) -> Option<GrepMatch> {
    // path:line:text （路径中可能含冒号的极少见；按首次两个冒号切）
    let (path, rest) = line.split_once(':')?;
    let (line_no, text) = rest.split_once(':')?;
    let line = line_no.parse::<u32>().ok()?;
    let text = if text.chars().count() > MAX_LINE_CHARS {
        let clipped: String = text.chars().take(MAX_LINE_CHARS).collect();
        format!("{clipped}…")
    } else {
        text.to_string()
    };
    Some(GrepMatch {
        path: path.to_string(),
        line,
        text,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_line_clips_long_text() {
        let long = format!("src/a.ts:12:{}", "x".repeat(400));
        let parsed = parse_grep_line(&long).expect("parse");
        assert!(parsed.text.ends_with('…'));
        assert!(parsed.text.chars().count() <= MAX_LINE_CHARS + 1);
    }

    #[test]
    fn rejects_empty_pattern() {
        let err = grep_code(Path::new("."), "  ", None, None).expect_err("empty");
        assert_eq!(err.code, "VALIDATION");
    }

    #[test]
    fn rejects_parent_pathspec_without_repo() {
        let err = grep_code(Path::new("."), "pay", Some("../outside"), None).expect_err("parent");
        assert_eq!(err.code, "VALIDATION");
    }
}
