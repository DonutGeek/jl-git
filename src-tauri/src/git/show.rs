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
    /// 新增行数；二进制为 None
    #[serde(skip_serializing_if = "Option::is_none")]
    pub additions: Option<u32>,
    /// 删除行数；二进制为 None
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deletions: Option<u32>,
}

#[derive(Debug, PartialEq, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitParentDiff {
    pub parent_id: String,
    pub parent_short_id: String,
    pub files: Vec<GitChangedFile>,
    /// 是否因硬顶截断改动文件列表
    pub truncated: bool,
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

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitMessageResult {
    pub message: String,
}

/// `git ls-tree -r` 路径硬顶，避免超大仓库一次灌入前端内存
const MAX_LS_TREE_PATHS: usize = 20_000;
/// 单 parent 改动文件列表硬顶
const MAX_COMMIT_CHANGED_FILES: usize = 5_000;

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitLsTreeResult {
    pub paths: Vec<String>,
    /// 是否因硬顶截断
    pub truncated: bool,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitContainingBranchesResult {
    pub branches: Vec<String>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitChangeSizeResult {
    pub file_count: u32,
    pub total_bytes: u64,
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
        let (files, truncated) = list_root_files(repo_path, &commit.id)?;
        diffs.push(GitCommitParentDiff {
            parent_id: String::new(),
            parent_short_id: String::new(),
            files,
            truncated,
        });
    } else {
        for (index, parent_id) in commit.parents.iter().enumerate() {
            let (files, truncated) = list_diff_files(repo_path, parent_id, &commit.id)?;
            diffs.push(GitCommitParentDiff {
                parent_id: parent_id.clone(),
                parent_short_id: commit
                    .parent_short_ids
                    .get(index)
                    .cloned()
                    .unwrap_or_else(|| abbreviate_id(parent_id)),
                files,
                truncated,
            });
        }
    }

    Ok(GitShowResult {
        commit: GitCommitDetail { diffs, ..commit },
    })
}

/// 读取完整提交文案（标题与正文），不解析 diff，供提交信息历史回填使用。
pub fn get_commit_message(repo_path: &Path, rev: &str) -> Result<GitCommitMessageResult, AppError> {
    validate_git_ref(rev)?;

    let output = runner::run_git(repo_path, &["log", "-1", "--no-patch", "--format=%B", rev])?;

    Ok(GitCommitMessageResult {
        message: output.stdout.trim_end().to_string(),
    })
}

/// 列出某提交树下全部文件路径（`git ls-tree -r --name-only`）
pub fn list_tree_paths(repo_path: &Path, rev: &str) -> Result<GitLsTreeResult, AppError> {
    validate_git_ref(rev)?;

    let output =
        runner::run_git_allow_nonzero(repo_path, &["ls-tree", "-r", "--name-only", "-z", rev])?;

    if output.code != 0 {
        let message = output
            .stderr
            .lines()
            .next()
            .unwrap_or("无法列出提交文件树")
            .to_string();
        return Err(AppError::new("GIT_FAILED", message).with_details(output.stderr));
    }

    let mut paths: Vec<String> = output
        .stdout
        .split('\0')
        .filter(|path| !path.is_empty())
        .map(str::to_string)
        .collect();

    let truncated = paths.len() > MAX_LS_TREE_PATHS;
    if truncated {
        paths.truncate(MAX_LS_TREE_PATHS);
    }

    Ok(GitLsTreeResult { paths, truncated })
}

/// 包含该提交的本地 / 远端分支名；若 HEAD 指向该提交则前置 `HEAD`
pub fn containing_branches(
    repo_path: &Path,
    rev: &str,
) -> Result<GitContainingBranchesResult, AppError> {
    validate_git_ref(rev)?;

    let head = runner::run_git_allow_nonzero(repo_path, &["rev-parse", "HEAD"])?;
    let target = runner::run_git_allow_nonzero(repo_path, &["rev-parse", rev])?;
    if head.code != 0 || target.code != 0 {
        let message = target
            .stderr
            .lines()
            .chain(head.stderr.lines())
            .next()
            .unwrap_or("无法解析提交")
            .to_string();
        return Err(AppError::new("GIT_FAILED", message));
    }

    let head_id = head.stdout.trim();
    let target_id = target.stdout.trim();
    let includes_head = !head_id.is_empty() && head_id == target_id;

    let output = runner::run_git_allow_nonzero(
        repo_path,
        &[
            "branch",
            "-a",
            "--contains",
            rev,
            "--format=%(refname:short)",
        ],
    )?;

    if output.code != 0 {
        let message = output
            .stderr
            .lines()
            .next()
            .unwrap_or("无法列出包含该提交的分支")
            .to_string();
        return Err(AppError::new("GIT_FAILED", message).with_details(output.stderr));
    }

    let mut branches: Vec<String> = output
        .stdout
        .lines()
        .map(str::trim)
        .filter(|name| !name.is_empty() && *name != "HEAD")
        .map(str::to_string)
        .collect();
    branches.sort();
    branches.dedup();

    if includes_head {
        branches.insert(0, "HEAD".to_string());
    }

    Ok(GitContainingBranchesResult { branches })
}

/// 改动文件数 + 非删除文件在该提交中的 blob 总大小
pub fn change_size(repo_path: &Path, rev: &str) -> Result<GitCommitChangeSizeResult, AppError> {
    validate_git_ref(rev)?;

    let meta = get_commit(repo_path, rev)?;
    let mut paths = std::collections::BTreeMap::<String, String>::new();
    for diff in &meta.commit.diffs {
        for file in &diff.files {
            paths.insert(file.path.clone(), file.status.clone());
        }
    }

    let file_count = paths.len() as u32;
    if file_count == 0 {
        return Ok(GitCommitChangeSizeResult {
            file_count: 0,
            total_bytes: 0,
        });
    }

    let tree =
        runner::run_git_allow_nonzero(repo_path, &["ls-tree", "-r", "-l", "-z", &meta.commit.id])?;

    if tree.code != 0 {
        let message = tree
            .stderr
            .lines()
            .next()
            .unwrap_or("无法读取提交文件大小")
            .to_string();
        return Err(AppError::new("GIT_FAILED", message).with_details(tree.stderr));
    }

    let sizes = parse_ls_tree_sizes_z(&tree.stdout);
    let mut total_bytes: u64 = 0;
    for (path, status) in &paths {
        if status == "D" {
            continue;
        }
        if let Some(size) = sizes.get(path) {
            total_bytes += size;
        }
    }

    Ok(GitCommitChangeSizeResult {
        file_count,
        total_bytes,
    })
}

/// 解析 `git ls-tree -r -l -z`：`<mode> <type> <object> <size>\t<path>\0`
fn parse_ls_tree_sizes_z(stdout: &str) -> std::collections::HashMap<String, u64> {
    let mut map = std::collections::HashMap::new();
    for entry in stdout.split('\0').filter(|p| !p.is_empty()) {
        let Some((meta, path)) = entry.split_once('\t') else {
            continue;
        };
        if path.is_empty() {
            continue;
        }
        // meta: "100644 blob <oid> <size>"；size 前可能有空格对齐
        let size_token = meta.split_whitespace().nth(3);
        if let Some(size) = size_token.and_then(|raw| raw.parse::<u64>().ok()) {
            map.insert(path.to_string(), size);
        }
    }
    map
}

fn parse_show_meta(stdout: &str) -> Result<GitCommitDetail, AppError> {
    // body 可能含换行，用 \0 分隔前 6 段后剩余为 body
    let mut parts = stdout.splitn(7, '\0');
    let id = parts.next().unwrap_or("").trim().to_string();
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
        parents_raw.split_whitespace().map(str::to_string).collect()
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
) -> Result<(Vec<GitChangedFile>, bool), AppError> {
    let status_out = runner::run_git_allow_nonzero(
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

    if status_out.code != 0 {
        let message = status_out
            .stderr
            .lines()
            .next()
            .unwrap_or("无法列出改动文件")
            .to_string();
        return Err(AppError::new("GIT_FAILED", message).with_details(status_out.stderr));
    }

    let mut files = parse_name_status_z(&status_out.stdout);
    attach_numstat(
        repo_path,
        &mut files,
        &[
            "diff-tree",
            "--no-commit-id",
            "--numstat",
            "-r",
            "-z",
            parent,
            commit,
        ],
    )?;
    sort_changed_files(&mut files);
    Ok(truncate_changed_files(files))
}

fn list_root_files(
    repo_path: &Path,
    commit: &str,
) -> Result<(Vec<GitChangedFile>, bool), AppError> {
    let status_out = runner::run_git_allow_nonzero(
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

    if status_out.code != 0 {
        let message = status_out
            .stderr
            .lines()
            .next()
            .unwrap_or("无法列出改动文件")
            .to_string();
        return Err(AppError::new("GIT_FAILED", message).with_details(status_out.stderr));
    }

    let mut files = parse_name_status_z(&status_out.stdout);
    attach_numstat(
        repo_path,
        &mut files,
        &[
            "diff-tree",
            "--no-commit-id",
            "--numstat",
            "-r",
            "-z",
            "--root",
            commit,
        ],
    )?;
    sort_changed_files(&mut files);
    Ok(truncate_changed_files(files))
}

fn truncate_changed_files(mut files: Vec<GitChangedFile>) -> (Vec<GitChangedFile>, bool) {
    let truncated = files.len() > MAX_COMMIT_CHANGED_FILES;
    if truncated {
        files.truncate(MAX_COMMIT_CHANGED_FILES);
    }
    (files, truncated)
}

/// A → M/T → D → R/C → 其余，同状态按路径；对齐常见 Git GUI 列表顺序
fn sort_changed_files(files: &mut [GitChangedFile]) {
    files.sort_by(|a, b| {
        status_sort_rank(&a.status)
            .cmp(&status_sort_rank(&b.status))
            .then_with(|| a.path.cmp(&b.path))
    });
}

fn status_sort_rank(status: &str) -> u8 {
    // 取首字母，兼容可能带分数的 R100 等
    match status.chars().next().unwrap_or('?') {
        'A' => 0,
        'M' | 'T' => 1,
        'D' => 2,
        'R' | 'C' => 3,
        _ => 9,
    }
}

/// 将 `--numstat` 增删行数合并进已有 name-status 列表
fn attach_numstat(
    repo_path: &Path,
    files: &mut [GitChangedFile],
    args: &[&str],
) -> Result<(), AppError> {
    let output = runner::run_git_allow_nonzero(repo_path, args)?;
    if output.code != 0 {
        // 行数失败不阻断文件列表
        return Ok(());
    }
    let stats = parse_numstat_z(&output.stdout);
    for file in files.iter_mut() {
        if let Some((additions, deletions)) = stats.get(&file.path) {
            file.additions = *additions;
            file.deletions = *deletions;
        }
    }
    Ok(())
}

/// 解析 `git diff-tree -z --numstat` / `git diff -z --numstat`：added\\tdeleted\\tpath\\0
pub(crate) fn parse_numstat_z(
    stdout: &str,
) -> std::collections::HashMap<String, (Option<u32>, Option<u32>)> {
    let mut map = std::collections::HashMap::new();
    for entry in stdout.split('\0').filter(|p| !p.is_empty()) {
        let mut cols = entry.splitn(3, '\t');
        let added_raw = cols.next().unwrap_or("");
        let deleted_raw = cols.next().unwrap_or("");
        let path = cols.next().unwrap_or("").to_string();
        if path.is_empty() {
            continue;
        }
        let additions = if added_raw == "-" {
            None
        } else {
            added_raw.parse::<u32>().ok()
        };
        let deletions = if deleted_raw == "-" {
            None
        } else {
            deleted_raw.parse::<u32>().ok()
        };
        map.insert(path, (additions, deletions));
    }
    map
}

/// 解析 `git diff-tree -z --name-status`：status\0path\0 或 R100\0old\0new\0
fn parse_name_status_z(stdout: &str) -> Vec<GitChangedFile> {
    let mut files = Vec::new();
    let mut parts = stdout.split('\0').filter(|p| !p.is_empty()).peekable();

    while let Some(status_raw) = parts.next() {
        let status_letter = status_raw.chars().next().unwrap_or('M').to_string();

        if status_letter == "R" || status_letter == "C" {
            let _old = parts.next();
            if let Some(new_path) = parts.next() {
                files.push(GitChangedFile {
                    path: new_path.to_string(),
                    status: status_letter,
                    additions: None,
                    deletions: None,
                });
            }
        } else if let Some(path) = parts.next() {
            files.push(GitChangedFile {
                path: path.to_string(),
                status: status_letter,
                additions: None,
                deletions: None,
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
                    additions: None,
                    deletions: None,
                },
                GitChangedFile {
                    path: "src/new.js".into(),
                    status: "A".into(),
                    additions: None,
                    deletions: None,
                },
                GitChangedFile {
                    path: "new.txt".into(),
                    status: "R".into(),
                    additions: None,
                    deletions: None,
                },
            ]
        );
    }

    #[test]
    fn sorts_changed_files_by_status_then_path() {
        let mut files = vec![
            GitChangedFile {
                path: "z.txt".into(),
                status: "M".into(),
                additions: None,
                deletions: None,
            },
            GitChangedFile {
                path: "a.txt".into(),
                status: "D".into(),
                additions: None,
                deletions: None,
            },
            GitChangedFile {
                path: "b.txt".into(),
                status: "A".into(),
                additions: None,
                deletions: None,
            },
            GitChangedFile {
                path: "c.txt".into(),
                status: "A".into(),
                additions: None,
                deletions: None,
            },
        ];
        sort_changed_files(&mut files);
        let paths: Vec<&str> = files.iter().map(|f| f.path.as_str()).collect();
        assert_eq!(paths, vec!["b.txt", "c.txt", "z.txt", "a.txt"]);
    }

    #[test]
    fn parses_numstat_z() {
        let raw = "12\t3\tpackage.json\0-\t-\tphoto.png\0";
        let stats = parse_numstat_z(raw);
        assert_eq!(stats.get("package.json"), Some(&(Some(12), Some(3))));
        assert_eq!(stats.get("photo.png"), Some(&(None, None)));
    }

    #[test]
    fn parses_ls_tree_sizes_z() {
        let raw = "100644 blob abcdef0123456789abcdef0123456789abcdef01   128\tREADME.md\0100644 blob abcdef0123456789abcdef0123456789abcdef02    42\tsrc/a.ts\0";
        let sizes = parse_ls_tree_sizes_z(raw);
        assert_eq!(sizes.get("README.md"), Some(&128));
        assert_eq!(sizes.get("src/a.ts"), Some(&42));
    }
}
