use std::time::{Duration, Instant};

use std::path::{Component, Path};

use crate::error::AppError;
use crate::git::path::{require_git_toplevel, validate_git_ref};
use crate::git::{runner, status};

/// fetch 默认超时：避免网络/凭据挂起拖死界面
const FETCH_TIMEOUT: Duration = Duration::from_secs(120);
const PUSH_TIMEOUT: Duration = Duration::from_secs(180);
/// clone 可能较大，放宽超时
const CLONE_TIMEOUT: Duration = Duration::from_secs(600);

/// fetch 结果：供前端展示耗时与远端名
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFetchResult {
    pub ok: bool,
    pub remote: String,
    /// 耗时（毫秒）
    pub elapsed_ms: u64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitPushResult {
    pub ok: bool,
    pub remote: String,
    pub elapsed_ms: u64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitPullResult {
    pub ok: bool,
    /// 拉取产生未合并冲突时为 true（与 merge 契约对齐）
    pub conflict: bool,
    pub remote: String,
    pub elapsed_ms: u64,
}

/// 检查更新：fetch 远端跟踪引用。
/// `git -c protocol.version=2 fetch --prune --recurse-submodules=on-demand <remote>`
/// 使用系统 credential helper（如 macOS Keychain），不禁用凭据；
/// `GIT_TERMINAL_PROMPT=0` 避免无 TTY 时卡住，凭据缺失时返回明确错误。
pub fn fetch(repo_path: &Path, remote: Option<&str>) -> Result<GitFetchResult, AppError> {
    let remote = remote.unwrap_or("origin");
    validate_git_ref(remote)?;

    let started = Instant::now();
    runner::run_git_timeout(
        repo_path,
        &[
            "-c",
            "protocol.version=2",
            "fetch",
            "--prune",
            "--recurse-submodules=on-demand",
            remote,
        ],
        FETCH_TIMEOUT,
    )?;

    Ok(GitFetchResult {
        ok: true,
        remote: remote.to_string(),
        elapsed_ms: started.elapsed().as_millis() as u64,
    })
}

/// 更新：pull 远端到当前分支（对齐 ugit：pull --recurse-submodules）。
/// 未指定 remote/branch 时走 upstream；不禁用 credential.helper。
pub fn pull(
    repo_path: &Path,
    remote: Option<&str>,
    branch: Option<&str>,
    rebase: bool,
) -> Result<GitPullResult, AppError> {
    if let Some(name) = remote {
        validate_git_ref(name)?;
    }
    if let Some(name) = branch {
        validate_git_ref(name)?;
    }

    let remote_label = remote.unwrap_or("origin").to_string();
    let started = Instant::now();

    let mut args: Vec<&str> = vec![
        "-c",
        "protocol.version=2",
        "pull",
        "--recurse-submodules",
        "--progress",
    ];
    if rebase {
        args.push("--rebase");
    }
    if let Some(name) = remote {
        args.push(name);
    }
    if let Some(name) = branch {
        args.push(name);
    }

    let output = runner::run_git_timeout_allow_nonzero(repo_path, &args, FETCH_TIMEOUT)?;
    let elapsed_ms = started.elapsed().as_millis() as u64;

    if output.code == 0 {
        return Ok(GitPullResult {
            ok: true,
            conflict: false,
            remote: remote_label,
            elapsed_ms,
        });
    }

    if status::has_unmerged_entries(&status::get_status(repo_path)?) {
        return Ok(GitPullResult {
            ok: false,
            conflict: true,
            remote: remote_label,
            elapsed_ms,
        });
    }

    Err(runner::error_from_failed_output(&args, output))
}

/// 推送到远端。对齐 ugit：`push --progress` + `protocol.version=2`；
/// 指定 remote/branch 时使用 `origin main:main` 式 refspec。
/// **不**清空 credential.helper（走系统 Keychain 等）。
pub fn push(
    repo_path: &Path,
    remote: Option<&str>,
    branch: Option<&str>,
    set_upstream: bool,
    force: bool,
) -> Result<GitPushResult, AppError> {
    if let Some(name) = remote {
        validate_git_ref(name)?;
    }
    if let Some(name) = branch {
        validate_git_ref(name)?;
    }

    let remote_label = remote.unwrap_or("origin").to_string();
    let started = Instant::now();

    let mut args: Vec<String> = vec![
        "-c".into(),
        "protocol.version=2".into(),
        "push".into(),
        "--progress".into(),
    ];
    if force {
        args.push("--force-with-lease".into());
    }
    if set_upstream {
        args.push("--set-upstream".into());
    }

    match (remote, branch) {
        (Some(remote_name), Some(branch_name)) => {
            args.push(remote_name.to_string());
            // 发布分支：origin <branch>；普通推送：origin main:main
            if set_upstream {
                args.push(branch_name.to_string());
            } else {
                args.push(format!("{branch_name}:{branch_name}"));
            }
        }
        (Some(remote_name), None) => {
            args.push(remote_name.to_string());
        }
        (None, Some(branch_name)) => {
            args.push("origin".into());
            if set_upstream {
                args.push(branch_name.to_string());
            } else {
                args.push(format!("{branch_name}:{branch_name}"));
            }
        }
        (None, None) => {
            // 跟随 upstream
        }
    }

    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    runner::run_git_timeout(repo_path, &arg_refs, PUSH_TIMEOUT)?;

    Ok(GitPushResult {
        ok: true,
        remote: remote_label,
        elapsed_ms: started.elapsed().as_millis() as u64,
    })
}

/// 远端条目：fetch / push URL（通常相同）
#[derive(Debug, Clone, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitRemote {
    pub name: String,
    pub fetch_url: String,
    pub push_url: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCloneResult {
    /// 克隆完成后的本地仓库绝对路径
    pub path: String,
    pub elapsed_ms: u64,
}

/// 克隆远端仓库到本地目录：`git clone -- <url> <dest>`（参数数组，禁止 shell）。
pub fn clone_repository(url: &str, dest: &Path) -> Result<GitCloneResult, AppError> {
    let url = url.trim();
    validate_clone_url(url)?;
    validate_clone_dest(dest)?;

    let parent = dest
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
        .ok_or_else(|| AppError::new("INVALID_PATH", "存放路径无效"))?;
    if !parent.exists() {
        return Err(AppError::new("INVALID_PATH", "存放目录不存在"));
    }
    if !parent.is_dir() {
        return Err(AppError::new("INVALID_PATH", "存放路径的上级不是目录"));
    }
    if dest.exists() {
        return Err(AppError::new(
            "VALIDATION",
            "目标路径已存在，请更换存放路径",
        ));
    }

    let dest_str = dest
        .to_str()
        .ok_or_else(|| AppError::new("INVALID_PATH", "存放路径无效"))?;

    let started = Instant::now();
    // 与 fetch/push 一致：不禁用 credential.helper；无 TTY 时不交互卡住
    runner::run_git_timeout(
        parent,
        &["clone", "--progress", "--", url, dest_str],
        CLONE_TIMEOUT,
    )?;

    let repo_path = require_git_toplevel(dest)?;
    Ok(GitCloneResult {
        path: repo_path.to_string_lossy().to_string(),
        elapsed_ms: started.elapsed().as_millis() as u64,
    })
}

fn validate_clone_url(url: &str) -> Result<(), AppError> {
    if url.is_empty() {
        return Err(AppError::new("VALIDATION", "请填写仓库地址"));
    }
    if url.contains('\0') || url.contains('\n') || url.contains('\r') {
        return Err(AppError::new("VALIDATION", "仓库地址非法"));
    }
    if url.starts_with('-') {
        return Err(AppError::new("VALIDATION", "仓库地址非法"));
    }
    let lower = url.to_ascii_lowercase();
    let looks_remote = lower.starts_with("http://")
        || lower.starts_with("https://")
        || lower.starts_with("ssh://")
        || lower.starts_with("git://")
        || lower.starts_with("git@")
        || url.contains(':');
    if !looks_remote {
        return Err(AppError::new(
            "VALIDATION",
            "请填写有效的仓库地址（HTTPS / SSH）",
        ));
    }
    Ok(())
}

fn validate_clone_dest(dest: &Path) -> Result<(), AppError> {
    if dest.as_os_str().is_empty() {
        return Err(AppError::new("VALIDATION", "请填写存放路径"));
    }
    if dest
        .components()
        .any(|component| matches!(component, Component::ParentDir))
    {
        return Err(AppError::new("VALIDATION", "存放路径不得包含 .."));
    }
    Ok(())
}

/// 列出远端：`git remote -v`
pub fn list_remotes(repo_path: &Path) -> Result<Vec<GitRemote>, AppError> {
    let output = runner::run_git(repo_path, &["remote", "-v"])?;
    Ok(parse_remote_verbose(&output.stdout))
}

fn parse_remote_verbose(stdout: &str) -> Vec<GitRemote> {
    use std::collections::BTreeMap;

    let mut fetch_urls: BTreeMap<String, String> = BTreeMap::new();
    let mut push_urls: BTreeMap<String, String> = BTreeMap::new();

    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let Some((name, rest)) = line.split_once(char::is_whitespace) else {
            continue;
        };
        let rest = rest.trim();
        let name = name.trim();
        if name.is_empty() {
            continue;
        }

        if let Some(url) = rest.strip_suffix(" (fetch)") {
            fetch_urls.insert(name.to_string(), url.trim().to_string());
        } else if let Some(url) = rest.strip_suffix(" (push)") {
            push_urls.insert(name.to_string(), url.trim().to_string());
        }
    }

    let mut names: Vec<String> = fetch_urls.keys().chain(push_urls.keys()).cloned().collect();
    names.sort();
    names.dedup();

    names
        .into_iter()
        .filter_map(|name| {
            let fetch_url = fetch_urls.get(&name).cloned().unwrap_or_default();
            let push_url = push_urls
                .get(&name)
                .cloned()
                .unwrap_or_else(|| fetch_url.clone());
            if fetch_url.is_empty() && push_url.is_empty() {
                return None;
            }
            Some(GitRemote {
                name,
                fetch_url: if fetch_url.is_empty() {
                    push_url.clone()
                } else {
                    fetch_url
                },
                push_url,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::parse_remote_verbose;

    #[test]
    fn parses_remote_verbose_output() {
        let stdout = "\
origin\tgit@github.com:acme/app.git (fetch)
origin\tgit@github.com:acme/app.git (push)
upstream\thttps://github.com/upstream/app.git (fetch)
upstream\thttps://github.com/upstream/app.git (push)
";
        let remotes = parse_remote_verbose(stdout);
        assert_eq!(remotes.len(), 2);
        assert_eq!(remotes[0].name, "origin");
        assert_eq!(remotes[0].fetch_url, "git@github.com:acme/app.git");
        assert_eq!(remotes[1].name, "upstream");
        assert_eq!(remotes[1].push_url, "https://github.com/upstream/app.git");
    }
}
