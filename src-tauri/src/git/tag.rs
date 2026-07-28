use serde::Serialize;
use std::path::Path;
use std::time::Duration;

use crate::error::AppError;
use crate::git::{path::validate_git_ref, runner};

const PUSH_TIMEOUT: Duration = Duration::from_secs(180);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitTag {
    pub name: String,
    pub target: String,
    /// 注解标签为 tagger 时间；轻量标签为指向提交时间；无则空串
    pub authored_at: String,
    /// 注解标签的标签信息（annotation）；轻量标签为空
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    /// 指向提交的标题（commit subject），供无标签信息时兜底展示
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subject: Option<String>,
}

/// 远端标签（来自 ls-remote），只含名称与指向对象 id
#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRemoteTag {
    pub name: String,
    pub target: String,
}

pub fn list_tags(repo_path: &Path) -> Result<Vec<GitTag>, AppError> {
    // objecttype 用于区分注解标签(tag)与轻量标签(commit)：
    // - 注解标签：contents:subject 为标签信息，*contents:subject 为指向提交标题
    // - 轻量标签：contents:subject 即指向提交标题，*contents:subject 为空
    let output = runner::run_git(
        repo_path,
        &[
            "for-each-ref",
            "--format=%(refname:short)%00%(objectname)%00%(creatordate:iso-strict)%00%(objecttype)%00%(contents:subject)%00%(*contents:subject)",
            "refs/tags",
        ],
    )?;

    Ok(parse_tags(&output.stdout))
}

pub fn create_tag(
    repo_path: &Path,
    name: &str,
    message: Option<&str>,
    target: Option<&str>,
) -> Result<(), AppError> {
    validate_tag_name(repo_path, name)?;
    if let Some(target) = target {
        validate_git_ref(target)?;
    }

    let mut args = vec!["tag"];
    if let Some(message) = message.filter(|value| !value.trim().is_empty()) {
        args.extend(["-a", "-m", message]);
    }
    args.extend(["--", name]);
    if let Some(target) = target {
        args.push(target);
    }

    runner::run_git(repo_path, &args)?;
    Ok(())
}

pub fn delete_tag(repo_path: &Path, name: &str) -> Result<(), AppError> {
    validate_tag_name(repo_path, name)?;
    runner::run_git(repo_path, &["tag", "-d", "--", name])?;
    Ok(())
}

/** 是否存在本地标签 `refs/tags/<name>` */
pub fn tag_exists(repo_path: &Path, name: &str) -> Result<bool, AppError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Ok(false);
    }
    let full_ref = format!("refs/tags/{trimmed}");
    let output =
        runner::run_git_allow_nonzero(repo_path, &["show-ref", "--verify", "--quiet", &full_ref])?;
    match output.code {
        0 => Ok(true),
        1 => Ok(false),
        _ => Err(AppError::new("GIT", "检查标签失败").with_details(output.stderr)),
    }
}

pub fn push_tag(repo_path: &Path, remote: &str, name: &str) -> Result<(), AppError> {
    validate_git_ref(remote)?;
    validate_tag_name(repo_path, name)?;
    let refspec = format!("refs/tags/{name}");
    // 标签推送不跑仓库 pre-push（如 pnpm check）：那是提交质量门禁，会让标签推送长时间卡住
    runner::run_git_timeout(
        repo_path,
        &[
            "-c",
            "protocol.version=2",
            "push",
            "--progress",
            "--no-verify",
            remote,
            &refspec,
        ],
        PUSH_TIMEOUT,
    )?;
    Ok(())
}

/// 列出远端标签：git ls-remote --tags --refs <remote>
/// `--refs` 过滤掉解引用的 `^{}` 行与伪引用，得到干净的 refs/tags/<name>
pub fn list_remote_tags(repo_path: &Path, remote: &str) -> Result<Vec<GitRemoteTag>, AppError> {
    validate_git_ref(remote)?;
    let output = runner::run_git_timeout(
        repo_path,
        &["ls-remote", "--tags", "--refs", remote],
        PUSH_TIMEOUT,
    )?;
    Ok(parse_remote_tags(&output.stdout))
}

/// 拉取指定远端标签到本地：git fetch <remote> tag <name>
pub fn fetch_remote_tag(repo_path: &Path, remote: &str, name: &str) -> Result<(), AppError> {
    validate_git_ref(remote)?;
    validate_tag_name(repo_path, name)?;
    runner::run_git_timeout(
        repo_path,
        &["fetch", "--progress", remote, "tag", name],
        PUSH_TIMEOUT,
    )?;
    Ok(())
}

/// 删除远端标签：git push <remote> --delete refs/tags/<name>
pub fn delete_remote_tag(repo_path: &Path, remote: &str, name: &str) -> Result<(), AppError> {
    validate_git_ref(remote)?;
    validate_tag_name(repo_path, name)?;
    let refspec = format!("refs/tags/{name}");
    // 同 push_tag：删远端标签不应触发 pre-push 全量检查
    runner::run_git_timeout(
        repo_path,
        &[
            "-c",
            "protocol.version=2",
            "push",
            "--progress",
            "--no-verify",
            remote,
            "--delete",
            &refspec,
        ],
        PUSH_TIMEOUT,
    )?;
    Ok(())
}

fn validate_tag_name(repo_path: &Path, name: &str) -> Result<(), AppError> {
    let trimmed = name.trim();
    validate_git_ref(trimmed)?;
    let full_ref = format!("refs/tags/{trimmed}");
    let output = runner::run_git_allow_nonzero(
        repo_path,
        &["check-ref-format", "--allow-onelevel", &full_ref],
    )?;
    if output.code == 0 {
        Ok(())
    } else {
        Err(AppError::new("VALIDATION", "非法标签名称"))
    }
}

fn parse_tags(stdout: &str) -> Vec<GitTag> {
    stdout
        .lines()
        .filter_map(|line| {
            let mut fields = line.split('\0');
            let name = fields.next()?.trim();
            let target = fields.next()?.trim();
            if name.is_empty() || target.is_empty() {
                return None;
            }
            let authored_at = fields.next().map(str::trim).unwrap_or("").to_string();
            let object_type = fields.next().map(str::trim).unwrap_or("");
            let contents_subject = fields
                .next()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string);
            let deref_subject = fields
                .next()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string);

            // 注解标签：contents 为标签信息，解引用后才是提交标题；轻量标签：contents 即提交标题
            let (message, subject) = if object_type == "tag" {
                (contents_subject, deref_subject)
            } else {
                (None, contents_subject)
            };

            Some(GitTag {
                name: name.to_string(),
                target: target.to_string(),
                authored_at,
                message,
                subject,
            })
        })
        .collect()
}

/// 解析 ls-remote 输出：每行形如 `<sha>\trefs/tags/<name>`
fn parse_remote_tags(stdout: &str) -> Vec<GitRemoteTag> {
    stdout
        .lines()
        .filter_map(|line| {
            let mut fields = line.split('\t');
            let target = fields.next()?.trim();
            let full_ref = fields.next()?.trim();
            let name = full_ref.strip_prefix("refs/tags/")?.trim();
            if name.is_empty() || target.is_empty() {
                return None;
            }
            Some(GitRemoteTag {
                name: name.to_string(),
                target: target.to_string(),
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{parse_remote_tags, parse_tags, GitRemoteTag};

    #[test]
    fn parses_annotated_and_lightweight_tags() {
        // 注解标签：objecttype=tag，contents 为标签信息，解引用后为提交标题
        // 轻量标签：objecttype=commit，contents 即提交标题，解引用为空
        let tags = parse_tags(
            "v1.0.0\0abc123\02026-07-01T10:00:00+08:00\0tag\0Release one\0Initial commit\nv1.1.0\0def456\0\0commit\0Fix bug\0\n",
        );

        assert_eq!(tags.len(), 2);
        assert_eq!(tags[0].name, "v1.0.0");
        assert_eq!(tags[0].authored_at, "2026-07-01T10:00:00+08:00");
        assert_eq!(tags[0].message.as_deref(), Some("Release one"));
        assert_eq!(tags[0].subject.as_deref(), Some("Initial commit"));
        assert_eq!(tags[1].authored_at, "");
        assert_eq!(tags[1].message, None);
        assert_eq!(tags[1].subject.as_deref(), Some("Fix bug"));
    }

    #[test]
    fn parses_remote_tags_from_ls_remote() {
        // --refs 已去除 ^{} 行，这里仅验证常规行解析
        let tags =
            parse_remote_tags("abc123\trefs/tags/v1.0.0\ndef456\trefs/tags/v1.1.0\n\tbad-line\n");

        assert_eq!(
            tags,
            vec![
                GitRemoteTag {
                    name: "v1.0.0".into(),
                    target: "abc123".into(),
                },
                GitRemoteTag {
                    name: "v1.1.0".into(),
                    target: "def456".into(),
                },
            ]
        );
    }
}
