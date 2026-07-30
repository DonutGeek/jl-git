use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;

use crate::error::AppError;
use crate::git::{
    diff::{
        binary_to_hex_text, bytes_to_text, looks_binary, read_blob, summarize_binary_diff,
        truncate_text_to_limit, GitDiffResult, DEFAULT_MAX_BYTES,
    },
    path::{validate_git_ref, validate_repo_relative_paths},
    runner,
    show::GitChangedFile,
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranchCompareResult {
    pub files: Vec<GitChangedFile>,
}

pub fn get_changed_files(
    repo_path: &Path,
    base: &str,
    target: &str,
) -> Result<GitBranchCompareResult, AppError> {
    validate_compare_refs(base, target)?;
    let statuses = runner::run_git(
        repo_path,
        &[
            "diff",
            "--name-status",
            "-z",
            "--find-renames",
            base,
            target,
        ],
    )?;
    let stats = runner::run_git(
        repo_path,
        &["diff", "--numstat", "-z", "--find-renames", base, target],
    )?;

    Ok(GitBranchCompareResult {
        files: merge_changed_files(&statuses.stdout, &stats.stdout),
    })
}

pub fn get_file_diff(
    repo_path: &Path,
    base: &str,
    target: &str,
    file_path: &str,
    max_bytes: Option<usize>,
    encoding: Option<&str>,
) -> Result<GitDiffResult, AppError> {
    validate_compare_refs(base, target)?;
    let file_path = file_path.trim();
    if file_path.is_empty() {
        return Err(AppError::new("VALIDATION", "缺少文件路径"));
    }
    validate_repo_relative_paths(&[file_path.to_string()])?;

    let limit = max_bytes
        .unwrap_or(DEFAULT_MAX_BYTES)
        .clamp(1_024, 8_388_608);
    let encoding = encoding.unwrap_or("utf-8");
    let old = read_blob(repo_path, &format!("{base}:{file_path}"))?;
    let new = read_blob(repo_path, &format!("{target}:{file_path}"))?;
    let patch_out = runner::run_git_allow_nonzero(
        repo_path,
        &["diff", "--no-ext-diff", base, target, "--", file_path],
    )?;
    if patch_out.code != 0 {
        let message = patch_out
            .stderr
            .lines()
            .next()
            .unwrap_or("无法读取分支文件差异")
            .to_string();
        return Err(AppError::new("GIT_FAILED", message).with_details(patch_out.stderr));
    }
    let mut patch = patch_out.stdout;
    let patch_truncated = truncate_text_to_limit(&mut patch, limit);

    if looks_binary(old.as_deref()) || looks_binary(new.as_deref()) {
        return Ok(GitDiffResult {
            old_text: binary_to_hex_text(old.as_deref()),
            new_text: binary_to_hex_text(new.as_deref()),
            patch,
            binary: true,
            truncated: patch_truncated,
            binary_comparison: Some(summarize_binary_diff(old.as_deref(), new.as_deref())),
        });
    }

    let (old_text, old_truncated) = bytes_to_text(old.unwrap_or_default(), limit, encoding);
    let (new_text, new_truncated) = bytes_to_text(new.unwrap_or_default(), limit, encoding);
    Ok(GitDiffResult {
        old_text,
        new_text,
        patch,
        binary: false,
        truncated: old_truncated || new_truncated || patch_truncated,
        binary_comparison: None,
    })
}

fn validate_compare_refs(base: &str, target: &str) -> Result<(), AppError> {
    validate_git_ref(base)?;
    validate_git_ref(target)
}

fn merge_changed_files(statuses: &str, numstat: &str) -> Vec<GitChangedFile> {
    let stats = parse_numstat_z(numstat);
    parse_name_status_z(statuses)
        .into_iter()
        .map(|mut file| {
            if let Some((additions, deletions)) = stats.get(&file.path) {
                file.additions = *additions;
                file.deletions = *deletions;
            }
            file
        })
        .collect()
}

fn parse_name_status_z(stdout: &str) -> Vec<GitChangedFile> {
    let parts: Vec<&str> = stdout.split('\0').collect();
    let mut index = 0;
    let mut files = Vec::new();
    while let Some(status_raw) = parts.get(index).copied() {
        index += 1;
        if status_raw.is_empty() {
            continue;
        }
        let status = status_raw.chars().next().unwrap_or('M').to_string();
        let path = if matches!(status.as_str(), "R" | "C") {
            index += 1;
            parts.get(index).copied()
        } else {
            parts.get(index).copied()
        };
        index += 1;
        if let Some(path) = path.filter(|path| !path.is_empty()) {
            files.push(GitChangedFile {
                path: path.to_string(),
                status,
                additions: None,
                deletions: None,
            });
        }
    }
    files
}

fn parse_numstat_z(stdout: &str) -> HashMap<String, (Option<u32>, Option<u32>)> {
    let parts: Vec<&str> = stdout.split('\0').collect();
    let mut index = 0;
    let mut stats = HashMap::new();
    while let Some(row) = parts.get(index).copied() {
        index += 1;
        if row.is_empty() {
            continue;
        }
        let mut columns = row.splitn(3, '\t');
        let additions = parse_numstat_count(columns.next().unwrap_or(""));
        let deletions = parse_numstat_count(columns.next().unwrap_or(""));
        let path = columns.next().unwrap_or("");
        let result_path = if path.is_empty() {
            index += 1;
            let renamed_path = parts.get(index).copied().unwrap_or("");
            index += 1;
            renamed_path
        } else {
            path
        };
        if !result_path.is_empty() {
            stats.insert(result_path.to_string(), (additions, deletions));
        }
    }
    stats
}

fn parse_numstat_count(value: &str) -> Option<u32> {
    if value == "-" {
        None
    } else {
        value.parse::<u32>().ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merges_name_status_and_numstat_by_result_path() {
        let statuses = "M\0src/a.ts\0R100\0src/old.ts\0src/new.ts\0D\0src/gone.ts\0";
        let numstat = concat!(
            "3\t1\tsrc/a.ts\0-\t-\t\0src/old.ts\0src/new.ts\0",
            "0\t4\tsrc/gone.ts\0"
        );

        assert_eq!(
            merge_changed_files(statuses, numstat),
            vec![
                GitChangedFile {
                    path: "src/a.ts".into(),
                    status: "M".into(),
                    additions: Some(3),
                    deletions: Some(1),
                },
                GitChangedFile {
                    path: "src/new.ts".into(),
                    status: "R".into(),
                    additions: None,
                    deletions: None,
                },
                GitChangedFile {
                    path: "src/gone.ts".into(),
                    status: "D".into(),
                    additions: Some(0),
                    deletions: Some(4),
                },
            ]
        );
    }

    #[test]
    fn rejects_invalid_branch_compare_refs() {
        assert!(validate_compare_refs("main", "-bad-ref").is_err());
    }
}
