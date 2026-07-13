use serde::Serialize;
use std::path::Path;

use crate::error::AppError;
use crate::git::{path::validate_git_ref, runner};

#[derive(Debug, PartialEq, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitChangedFile {
    pub path: String,
    /// A / M / D / R / C 等 name-status 状态
    pub status: String,
}

#[derive(Debug, PartialEq, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitParentDiff {
    pub parent_id: String,
    pub parent_short_id: String,
    pub files: Vec<GitChangedFile>,
}

#[derive(Debug, PartialEq, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitDetail {
    pub id: String,
    pub short_id: String,
    pub author_name: String,
    pub authored_at: String,
    pub subject: String,
    pub body: String,
    pub parents: Vec<String>,
    pub parent_short_ids: Vec<String>,
    pub diffs: Vec<GitCommitParentDiff>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitShowResult {
    pub commit: GitCommitDetail,
}

/// 读取单提交元数据，并对每个 parent 列出 name-status 改动文件
pub fn get_commit(repo_path: &Path, rev: &str) -> Result<GitShowResult, AppError> {
    validate_git_ref(rev)?;

    let meta = runner::run_git_allow_nonzero(
        repo_path,
        &[
            "show",
            "-s",
            "--format=%H%x00%h%x00%an%x00%aI%x00%P%x00%s%x00%b",
            "--no-patch",
            rev,
        ],
    )?;

    if meta.code != 0 {
        let message = meta
            .stderr
            .lines()
            .next()
            .unwrap_or("无法读取提交")
            .to_string();
        return Err(AppError::new("GIT_FAILED", message).with_details(meta.stderr));
    }

    let commit = parse_show_meta(&meta.stdout)?;
    let mut diffs = Vec::with_capacity(commit.parents.len().max(1));

    if commit.parents.is_empty() {
        // 根提交：相对空树
        let files = list_root_files(repo_path, &commit.id)?;
        diffs.push(GitCommitParentDiff {
            parent_id: String::new(),
            parent_short_id: String::new(),
            files,
        });
    } else {
        for (index, parent_id) in commit.parents.iter().enumerate() {
            let files = list_diff_files(repo_path, parent_id, &commit.id)?;
            diffs.push(GitCommitParentDiff {
                parent_id: parent_id.clone(),
                parent_short_id: commit
                    .parent_short_ids
                    .get(index)
                    .cloned()
                    .unwrap_or_else(|| abbreviate_id(parent_id)),
                files,
            });
        }
    }

    Ok(GitShowResult {
        commit: GitCommitDetail { diffs, ..commit },
    })
}

fn parse_show_meta(stdout: &str) -> Result<GitCommitDetail, AppError> {
    // body 可能含换行，用 \0 分隔前 6 段后剩余为 body
    let mut parts = stdout.splitn(7, '\0');
    let id = parts
        .next()
        .unwrap_or("")
        .trim()
        .to_string();
    let short_id = parts.next().unwrap_or("").trim().to_string();
    let author_name = parts.next().unwrap_or("").trim().to_string();
    let authored_at = parts.next().unwrap_or("").trim().to_string();
    let parents_raw = parts.next().unwrap_or("").trim().to_string();
    let subject = parts.next().unwrap_or("").trim().to_string();
    let body = parts.next().unwrap_or("").trim_end().to_string();

    if id.is_empty() || short_id.is_empty() {
        return Err(AppError::new("GIT_FAILED", "提交元数据解析失败"));
    }

    let parents: Vec<String> = if parents_raw.is_empty() {
        Vec::new()
    } else {
        parents_raw
            .split_whitespace()
            .map(str::to_string)
            .collect()
    };
    let parent_short_ids: Vec<String> = parents.iter().map(|p| abbreviate_id(p)).collect();

    Ok(GitCommitDetail {
        id,
        short_id,
        author_name,
        authored_at,
        subject,
        body,
        parents,
        parent_short_ids,
        diffs: Vec::new(),
    })
}

fn list_diff_files(
    repo_path: &Path,
    parent: &str,
    commit: &str,
) -> Result<Vec<GitChangedFile>, AppError> {
    let output = runner::run_git_allow_nonzero(
        repo_path,
        &[
            "diff-tree",
            "--no-commit-id",
            "--name-status",
            "-r",
            "-z",
            parent,
            commit,
        ],
    )?;

    if output.code != 0 {
        let message = output
            .stderr
            .lines()
            .next()
            .unwrap_or("无法列出改动文件")
            .to_string();
        return Err(AppError::new("GIT_FAILED", message).with_details(output.stderr));
    }

    Ok(parse_name_status_z(&output.stdout))
}

fn list_root_files(repo_path: &Path, commit: &str) -> Result<Vec<GitChangedFile>, AppError> {
    let output = runner::run_git_allow_nonzero(
        repo_path,
        &[
            "diff-tree",
            "--no-commit-id",
            "--name-status",
            "-r",
            "-z",
            "--root",
            commit,
        ],
    )?;

    if output.code != 0 {
        let message = output
            .stderr
            .lines()
            .next()
            .unwrap_or("无法列出改动文件")
            .to_string();
        return Err(AppError::new("GIT_FAILED", message).with_details(output.stderr));
    }

    Ok(parse_name_status_z(&output.stdout))
}

/// 解析 `git diff-tree -z --name-status`：status\0path\0 或 R100\0old\0new\0
fn parse_name_status_z(stdout: &str) -> Vec<GitChangedFile> {
    let mut files = Vec::new();
    let mut parts = stdout.split('\0').filter(|p| !p.is_empty()).peekable();

    while let Some(status_raw) = parts.next() {
        let status_letter = status_raw
            .chars()
            .next()
            .unwrap_or('M')
            .to_string();

        if status_letter == "R" || status_letter == "C" {
            let _old = parts.next();
            if let Some(new_path) = parts.next() {
                files.push(GitChangedFile {
                    path: new_path.to_string(),
                    status: status_letter,
                });
            }
        } else if let Some(path) = parts.next() {
            files.push(GitChangedFile {
                path: path.to_string(),
                status: status_letter,
            });
        }
    }

    files
}

fn abbreviate_id(full: &str) -> String {
    full.chars().take(7).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_meta_with_two_parents_and_body() {
        let stdout = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\0aaaaaaa\0Alice\02026-07-10T10:35:20+08:00\0bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb cccccccccccccccccccccccccccccccccccccccc\0Merge branch 'feat'\0body line\n";
        let detail = parse_show_meta(stdout).unwrap();
        assert_eq!(detail.short_id, "aaaaaaa");
        assert_eq!(detail.parents.len(), 2);
        assert_eq!(detail.parent_short_ids[0], "bbbbbbb");
        assert_eq!(detail.subject, "Merge branch 'feat'");
        assert!(detail.body.contains("body line"));
    }

    #[test]
    fn parses_name_status_z() {
        let raw = "M\0package.json\0A\0src/new.js\0R100\0old.txt\0new.txt\0";
        let files = parse_name_status_z(raw);
        assert_eq!(
            files,
            vec![
                GitChangedFile {
                    path: "package.json".into(),
                    status: "M".into(),
                },
                GitChangedFile {
                    path: "src/new.js".into(),
                    status: "A".into(),
                },
                GitChangedFile {
                    path: "new.txt".into(),
                    status: "R".into(),
                },
            ]
        );
    }
}
