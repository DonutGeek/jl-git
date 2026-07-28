//! Git 子进程额外 PATH：供 husky 等钩子找到 node。

use serde::Serialize;
use std::env;
use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;

use crate::error::AppError;

static EXTRA_PATH_DIRS: Mutex<Vec<PathBuf>> = Mutex::new(Vec::new());

/// 解析用户配置的额外 PATH 文本（多行；Unix 亦支持 `:`，Windows 亦支持 `;`）
pub fn parse_extra_path_text(raw: &str) -> Vec<PathBuf> {
    let mut tokens: Vec<String> = Vec::new();
    for line in raw.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        #[cfg(windows)]
        {
            for part in line.split(';') {
                let part = part.trim();
                if !part.is_empty() {
                    tokens.push(part.to_string());
                }
            }
        }
        #[cfg(not(windows))]
        {
            for part in line.split(':') {
                let part = part.trim();
                if !part.is_empty() {
                    tokens.push(part.to_string());
                }
            }
        }
    }

    let mut dirs = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for token in tokens {
        if let Some(path) = normalize_path_dir(&token) {
            let key = path.to_string_lossy().to_string();
            if seen.insert(key) {
                dirs.push(path);
            }
        }
    }
    dirs
}

/// 写入进程内额外 PATH 前缀（仅绝对目录）
pub fn set_extra_path_from_text(raw: &str) -> Result<Vec<String>, AppError> {
    let dirs = parse_extra_path_text(raw);
    let display: Vec<String> = dirs
        .iter()
        .map(|path| path.to_string_lossy().to_string())
        .collect();
    let mut guard = EXTRA_PATH_DIRS
        .lock()
        .map_err(|_| AppError::new("INTERNAL", "PATH 配置锁损坏"))?;
    *guard = dirs;
    Ok(display)
}

/// 合并额外目录与当前进程 PATH
pub fn effective_path_os() -> OsString {
    let dirs = EXTRA_PATH_DIRS
        .lock()
        .map(|guard| guard.clone())
        .unwrap_or_default();
    let sep = path_separator();
    let mut parts: Vec<OsString> = dirs.into_iter().map(|path| path.into_os_string()).collect();
    if let Some(current) = env::var_os("PATH") {
        parts.push(current);
    }
    join_path_parts(&parts, sep)
}

/// 将合并后的 PATH 写入 Command（钩子会继承）
pub fn apply_to_command(command: &mut Command) {
    let dirs_empty = EXTRA_PATH_DIRS
        .lock()
        .map(|guard| guard.is_empty())
        .unwrap_or(true);
    if dirs_empty {
        return;
    }
    command.env("PATH", effective_path_os());
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HookToolchainProbe {
    pub node_path: Option<String>,
    pub node_version: Option<String>,
    pub path_used: String,
    pub extra_dirs: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoverNodeBinResult {
    pub bin_dir: Option<String>,
    pub node_path: Option<String>,
    pub node_version: Option<String>,
}

/// 在当前（含额外 PATH）环境下探测 node；找不到时回退到常见安装位置
pub fn probe_hook_toolchain() -> Result<HookToolchainProbe, AppError> {
    let path_used = effective_path_os();
    let path_display = path_used.to_string_lossy().to_string();
    let extra_dirs = EXTRA_PATH_DIRS
        .lock()
        .map(|guard| {
            guard
                .iter()
                .map(|path| path.to_string_lossy().to_string())
                .collect()
        })
        .unwrap_or_default();

    let (mut node_path, mut node_version) = probe_tool("node", &path_used);
    if node_path.is_none() {
        if let Some(discovered) = discover_node_executable() {
            node_version = tool_version(&discovered, &path_used);
            node_path = Some(discovered);
        }
    }

    Ok(HookToolchainProbe {
        node_path,
        node_version,
        path_used: path_display,
        extra_dirs,
    })
}

/// 发现本机 node 所在 bin 目录（供首次启动自动填入）
pub fn discover_node_bin() -> Result<DiscoverNodeBinResult, AppError> {
    let path_env = env::var_os("PATH").unwrap_or_default();
    let node_exe = which_on_path("node", &path_env).or_else(discover_node_executable);
    let Some(node_path) = node_exe else {
        return Ok(DiscoverNodeBinResult {
            bin_dir: None,
            node_path: None,
            node_version: None,
        });
    };
    let bin_dir = PathBuf::from(&node_path)
        .parent()
        .map(|path| path.to_string_lossy().to_string());
    let node_version = tool_version(&node_path, &path_env);
    Ok(DiscoverNodeBinResult {
        bin_dir,
        node_path: Some(node_path),
        node_version,
    })
}

fn discover_node_executable() -> Option<String> {
    let home = home_dir_string().map(PathBuf::from);
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Some(ref home_dir) = home {
        // nvm：优先 default alias，否则取最高版本
        if let Some(bin) = nvm_preferred_node_bin(home_dir) {
            candidates.push(bin);
        }
        for path in nvm_all_node_bins(home_dir) {
            candidates.push(path);
        }
        // fnm
        candidates.extend(glob_node_bins(
            &home_dir.join(".fnm/node-versions"),
            &["installation", "bin"],
        ));
        candidates.extend(glob_node_bins(
            &home_dir.join(".local/share/fnm/node-versions"),
            &["installation", "bin"],
        ));
        // asdf
        candidates.extend(glob_node_bins(
            &home_dir.join(".asdf/installs/nodejs"),
            &["bin"],
        ));
        // volta
        candidates.push(home_dir.join("bin").join(node_exe_name()));
        candidates.push(home_dir.join(".volta/bin").join(node_exe_name()));
    }

    #[cfg(target_os = "macos")]
    {
        candidates.push(PathBuf::from("/opt/homebrew/bin").join(node_exe_name()));
        candidates.push(PathBuf::from("/usr/local/bin").join(node_exe_name()));
    }
    #[cfg(target_os = "linux")]
    {
        candidates.push(PathBuf::from("/usr/local/bin").join(node_exe_name()));
        candidates.push(PathBuf::from("/usr/bin").join(node_exe_name()));
    }
    #[cfg(windows)]
    {
        if let Some(ref home_dir) = home {
            candidates.push(home_dir.join("AppData/Roaming/nvm").join(node_exe_name()));
        }
        if let Ok(program_files) = env::var("ProgramFiles") {
            candidates.push(
                PathBuf::from(program_files)
                    .join("nodejs")
                    .join(node_exe_name()),
            );
        }
    }

    for candidate in candidates {
        if candidate.is_file() {
            return Some(candidate.to_string_lossy().to_string());
        }
    }
    None
}

fn node_exe_name() -> &'static str {
    if cfg!(windows) {
        "node.exe"
    } else {
        "node"
    }
}

fn nvm_preferred_node_bin(home: &Path) -> Option<PathBuf> {
    let alias = home.join(".nvm/alias/default");
    let alias_text = fs::read_to_string(alias).ok()?;
    let version = alias_text.lines().next()?.trim();
    if version.is_empty() {
        return None;
    }
    let version_name = if version.starts_with('v') {
        version.to_string()
    } else {
        format!("v{version}")
    };
    let bin = home
        .join(".nvm/versions/node")
        .join(version_name)
        .join("bin")
        .join(node_exe_name());
    bin.is_file().then_some(bin)
}

fn nvm_all_node_bins(home: &Path) -> Vec<PathBuf> {
    let root = home.join(".nvm/versions/node");
    let Ok(entries) = fs::read_dir(&root) else {
        return Vec::new();
    };
    let mut versions: Vec<(Vec<u64>, PathBuf)> = Vec::new();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.starts_with('v') {
            continue;
        }
        let bin = entry.path().join("bin").join(node_exe_name());
        if !bin.is_file() {
            continue;
        }
        versions.push((parse_loose_version(&name[1..]), bin));
    }
    versions.sort_by(|a, b| b.0.cmp(&a.0));
    versions.into_iter().map(|(_, path)| path).collect()
}

fn glob_node_bins(versions_root: &Path, suffix: &[&str]) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(versions_root) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let mut path = entry.path();
        for part in suffix {
            path = path.join(part);
        }
        path = path.join(node_exe_name());
        if path.is_file() {
            out.push(path);
        }
    }
    out
}

fn parse_loose_version(raw: &str) -> Vec<u64> {
    raw.split('.')
        .filter_map(|part| {
            let digits: String = part.chars().take_while(|ch| ch.is_ascii_digit()).collect();
            digits.parse().ok()
        })
        .collect()
}

fn probe_tool(name: &str, path_env: &OsString) -> (Option<String>, Option<String>) {
    let resolved = which_on_path(name, path_env);
    let version = resolved
        .as_ref()
        .and_then(|exe| tool_version(exe, path_env));
    (resolved, version)
}

fn which_on_path(name: &str, path_env: &OsString) -> Option<String> {
    #[cfg(windows)]
    let which = "where";
    #[cfg(not(windows))]
    let which = "which";

    let mut command = Command::new(which);
    crate::process_cmd::configure_background_command(&mut command);
    let output = command.env("PATH", path_env).arg(name).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let path = String::from_utf8_lossy(&output.stdout)
        .lines()
        .next()?
        .trim()
        .to_string();
    if path.is_empty() {
        None
    } else {
        Some(path)
    }
}

fn tool_version(exe: &str, path_env: &OsString) -> Option<String> {
    let mut command = Command::new(exe);
    crate::process_cmd::configure_background_command(&mut command);
    let output = command.env("PATH", path_env).arg("-v").output().ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let line = text.lines().next().unwrap_or("").trim();
    if line.is_empty() {
        None
    } else {
        Some(line.to_string())
    }
}

fn normalize_path_dir(raw: &str) -> Option<PathBuf> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    // 拒绝可疑动态片段
    if trimmed.contains('$') || trimmed.contains('`') || trimmed.contains('\0') {
        return None;
    }

    let expanded = expand_tilde(trimmed);
    let path = PathBuf::from(&expanded);
    if !path.is_absolute() {
        return None;
    }
    // 允许尚不存在的目录（用户先填路径再装工具），但必须像目录路径
    if path
        .file_name()
        .is_some_and(|name| name.to_string_lossy().contains('.'))
        && path.extension().is_some()
        && !path.is_dir()
    {
        // 像文件（含扩展名）且不是已有目录时拒绝，避免把 node 二进制当 PATH
        return None;
    }
    Some(path)
}

fn expand_tilde(raw: &str) -> String {
    if raw == "~" {
        return home_dir_string().unwrap_or_else(|| raw.to_string());
    }
    if let Some(rest) = raw.strip_prefix("~/") {
        if let Some(home) = home_dir_string() {
            return format!(
                "{}{}{}",
                home,
                std::path::MAIN_SEPARATOR,
                rest.replace('/', std::path::MAIN_SEPARATOR_STR)
            );
        }
    }
    #[cfg(windows)]
    {
        if let Some(rest) = raw.strip_prefix("~\\") {
            if let Some(home) = home_dir_string() {
                return format!("{home}\\{rest}");
            }
        }
    }
    raw.to_string()
}

fn home_dir_string() -> Option<String> {
    env::var_os("HOME")
        .or_else(|| env::var_os("USERPROFILE"))
        .map(|value| PathBuf::from(value).to_string_lossy().to_string())
}

fn path_separator() -> &'static str {
    if cfg!(windows) {
        ";"
    } else {
        ":"
    }
}

fn join_path_parts(parts: &[OsString], sep: &str) -> OsString {
    let mut out = OsString::new();
    for (index, part) in parts.iter().enumerate() {
        if index > 0 {
            out.push(sep);
        }
        out.push(part);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_multiline_and_skip_comments() {
        let dirs = parse_extra_path_text("# comment\n/usr/local/bin\n\n/opt/homebrew/bin\n");
        assert_eq!(dirs.len(), 2);
        assert_eq!(dirs[0], PathBuf::from("/usr/local/bin"));
        assert_eq!(dirs[1], PathBuf::from("/opt/homebrew/bin"));
    }

    #[test]
    fn reject_relative_and_dollar() {
        assert!(normalize_path_dir("relative/bin").is_none());
        assert!(normalize_path_dir("/tmp/$(evil)").is_none());
    }

    #[test]
    fn expand_tilde_home() {
        if home_dir_string().is_none() {
            return;
        }
        let path = normalize_path_dir("~/tools/bin").expect("tilde");
        assert!(path.is_absolute());
        assert!(path.ends_with(Path::new("tools/bin")) || path.ends_with(Path::new("tools\\bin")));
    }

    #[test]
    fn parse_loose_version_orders() {
        assert!(parse_loose_version("24.14.0") > parse_loose_version("22.23.1"));
    }
}
