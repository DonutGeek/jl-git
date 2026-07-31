use crate::error::AppError;
use crate::git::remote::{is_scp_like_remote, validate_clone_url};

/// 将远程 URL 规范为 `host/owner/repository…`（小写 host 与路径段，去协议/用户/默认端口/`.git`/尾斜杠）。
/// 无法解析时返回 None（调用方跳过比较，不阻断）。
pub fn canonicalize_remote_identity(url: &str) -> Option<String> {
    let url = url.trim();
    if url.is_empty() {
        return None;
    }

    let (host, path) = if is_scp_like_remote(url) {
        let (host_part, path_part) = url.split_once(':')?;
        let host = host_part
            .rsplit('@')
            .next()
            .unwrap_or(host_part)
            .to_ascii_lowercase();
        (host, path_part.to_string())
    } else {
        parse_url_authority_path(url)?
    };

    let path = normalize_repo_path(&path);
    if path.is_empty() || host.is_empty() {
        return None;
    }
    let segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
    if segments.len() < 2 {
        return None;
    }
    let path_key = segments
        .iter()
        .map(|s| s.to_ascii_lowercase())
        .collect::<Vec<_>>()
        .join("/");
    Some(format!("{host}/{path_key}"))
}

/// 校验远程 URL（克隆前检查用）。
pub fn require_remote_url(url: &str) -> Result<(), AppError> {
    validate_clone_url(url)
}

fn normalize_repo_path(path: &str) -> String {
    let path = path.trim().trim_matches('/').trim_end_matches(".git");
    path.trim_end_matches('/').to_string()
}

/// 解析 `scheme://[userinfo@]host[:port]/path`；不引入 url crate。
fn parse_url_authority_path(url: &str) -> Option<(String, String)> {
    let (scheme, rest) = url.split_once("://")?;
    let scheme = scheme.to_ascii_lowercase();
    if !matches!(scheme.as_str(), "http" | "https" | "ssh" | "git") {
        return None;
    }
    if rest.is_empty() {
        return None;
    }
    let (authority, path) = match rest.split_once('/') {
        Some((authority, path)) => (authority, path.to_string()),
        None => (rest, String::new()),
    };
    if authority.is_empty() {
        return None;
    }
    let hostport = authority.rsplit('@').next().unwrap_or(authority);
    if hostport.is_empty() {
        return None;
    }

    let host = strip_default_port(&scheme, hostport)?.to_ascii_lowercase();
    Some((host, path))
}

fn strip_default_port<'a>(scheme: &str, hostport: &'a str) -> Option<&'a str> {
    // IPv6 `[::1]:port` 暂不特殊处理；Git 托管几乎总是主机名
    if hostport.starts_with('[') {
        return Some(hostport);
    }
    let Some((host, port_str)) = hostport.rsplit_once(':') else {
        return Some(hostport);
    };
    if host.is_empty() || port_str.is_empty() || !port_str.chars().all(|c| c.is_ascii_digit()) {
        return Some(hostport);
    }
    let port: u16 = port_str.parse().ok()?;
    let default = matches!(
        (scheme, port),
        ("http", 80) | ("https", 443) | ("ssh", 22) | ("git", 9418)
    );
    if default {
        Some(host)
    } else {
        Some(hostport)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn https_and_ssh_match() {
        let a = canonicalize_remote_identity("https://github.com/acme/demo.git").unwrap();
        let b = canonicalize_remote_identity("git@github.com:acme/demo.git").unwrap();
        let c = canonicalize_remote_identity("ssh://git@github.com/acme/demo").unwrap();
        assert_eq!(a, "github.com/acme/demo");
        assert_eq!(a, b);
        assert_eq!(a, c);
    }

    #[test]
    fn strips_default_port_and_slash() {
        let a = canonicalize_remote_identity("https://github.com:443/acme/demo/").unwrap();
        assert_eq!(a, "github.com/acme/demo");
    }

    #[test]
    fn nested_group_keeps_full_path() {
        let a = canonicalize_remote_identity("https://gitlab.com/group/sub/repo.git").unwrap();
        assert_eq!(a, "gitlab.com/group/sub/repo");
    }

    #[test]
    fn rejects_incomplete_path() {
        assert!(canonicalize_remote_identity("https://github.com/only-owner").is_none());
    }
}
