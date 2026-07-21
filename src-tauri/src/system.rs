use font_kit::source::SystemSource;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;
use std::time::Instant;

use crate::error::AppError;
use crate::git::path::normalize_existing_dir;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemAppInfo {
    pub name: String,
    pub version: String,
    pub arch: String,
    /// 操作系统标识（如 macos / windows / linux）
    pub os: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemRuntimeStats {
    pub pid: u32,
    pub rss_bytes: u64,
    /// 本进程 CPU 占用百分比；不可用时为 0
    pub cpu_percent: f32,
    pub uptime_ms: u64,
}

fn process_start() -> &'static Instant {
    static START: OnceLock<Instant> = OnceLock::new();
    START.get_or_init(Instant::now)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemDiskSpace {
    pub path: String,
    pub total_bytes: u64,
    pub available_bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OkResult {
    pub ok: bool,
}

/// 应用版本与架构（供状态栏 / 关于页展示）
pub fn app_info() -> SystemAppInfo {
    SystemAppInfo {
        name: "鲸灵Git".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        arch: normalize_arch(std::env::consts::ARCH),
        os: std::env::consts::OS.to_string(),
    }
}

/// 本进程轻量运行时指标（供设置「关于」约 1s 轮询）
pub fn runtime_stats() -> Result<SystemRuntimeStats, AppError> {
    let pid = std::process::id();
    let uptime_ms = process_start().elapsed().as_millis() as u64;
    let (rss_bytes, cpu_percent) = read_process_metrics(pid)?;
    Ok(SystemRuntimeStats {
        pid,
        rss_bytes,
        cpu_percent,
        uptime_ms,
    })
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn read_process_metrics(pid: u32) -> Result<(u64, f32), AppError> {
    let output = Command::new("ps")
        .args(["-o", "rss=,pcpu=", "-p", &pid.to_string()])
        .output()
        .map_err(|error| {
            AppError::new("INTERNAL", "无法读取进程状态").with_details(error.to_string())
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::new("INTERNAL", "读取进程状态失败").with_details(stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_ps_rss_pcpu(&stdout)
}

/// 解析 `ps -o rss=,pcpu=`：RSS 为 KB，pcpu 为百分比
#[cfg(any(target_os = "macos", target_os = "linux"))]
fn parse_ps_rss_pcpu(stdout: &str) -> Result<(u64, f32), AppError> {
    let line = stdout
        .lines()
        .find(|line| !line.trim().is_empty())
        .ok_or_else(|| AppError::new("INTERNAL", "进程状态输出为空"))?;
    let parts: Vec<&str> = line.split_whitespace().collect();
    if parts.len() < 2 {
        return Err(AppError::new("INTERNAL", "无法解析进程状态"));
    }
    let rss_kb: u64 = parts[0]
        .parse()
        .map_err(|_| AppError::new("INTERNAL", "无法解析进程内存"))?;
    let cpu_percent: f32 = parts[1]
        .parse()
        .map_err(|_| AppError::new("INTERNAL", "无法解析进程 CPU"))?;
    Ok((rss_kb.saturating_mul(1024), cpu_percent))
}

#[cfg(target_os = "windows")]
fn read_process_metrics(pid: u32) -> Result<(u64, f32), AppError> {
    // WorkingSetSize 单位字节；CPU 百分比 Windows 侧不易瞬时取得，返回 0 由 UI 显示「—」
    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            &format!(
                "(Get-Process -Id {pid} -ErrorAction Stop).WorkingSet64"
            ),
        ])
        .output()
        .map_err(|error| {
            AppError::new("INTERNAL", "无法读取进程状态").with_details(error.to_string())
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::new("INTERNAL", "读取进程状态失败").with_details(stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let rss_bytes: u64 = stdout
        .trim()
        .parse()
        .map_err(|_| AppError::new("INTERNAL", "无法解析进程内存"))?;
    Ok((rss_bytes, 0.0))
}

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
fn read_process_metrics(_pid: u32) -> Result<(u64, f32), AppError> {
    Err(AppError::new("INTERNAL", "当前平台不支持进程采样"))
}

/// 枚举本机已安装字体族（去重、排序）
pub fn list_fonts() -> Result<Vec<String>, AppError> {
    let source = SystemSource::new();
    let mut families = source.all_families().map_err(|error| {
        AppError::new("INTERNAL", "无法读取本机字体列表").with_details(error.to_string())
    })?;
    families.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
    families.dedup_by(|a, b| a.eq_ignore_ascii_case(b));
    Ok(families)
}

fn normalize_arch(arch: &str) -> String {
    match arch {
        "aarch64" => "ARM64".to_string(),
        "x86_64" => "x64".to_string(),
        other => other.to_uppercase(),
    }
}

fn default_disk_path() -> PathBuf {
    if let Ok(home) = std::env::var("HOME") {
        return PathBuf::from(home);
    }
    PathBuf::from("/")
}

/// 查询路径所在卷的磁盘空间（macOS/Linux 用 df -kP）
pub fn disk_space(path: Option<&str>) -> Result<SystemDiskSpace, AppError> {
    let target = match path {
        Some(raw) if !raw.trim().is_empty() => {
            let p = PathBuf::from(raw);
            if !p.exists() {
                return Err(AppError::new("INVALID_PATH", "路径不存在"));
            }
            p
        }
        _ => default_disk_path(),
    };

    disk_space_for_path(&target)
}

fn disk_space_for_path(path: &Path) -> Result<SystemDiskSpace, AppError> {
    let path_str = path.to_string_lossy();
    let output = Command::new("df")
        .args(["-kP", path_str.as_ref()])
        .output()
        .map_err(|error| {
            AppError::new("INTERNAL", "无法读取磁盘空间").with_details(error.to_string())
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::new("INTERNAL", "读取磁盘空间失败").with_details(stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_df_kp(&stdout)
}

/// 解析 `df -kP`：第二行起为数据；字段为 1024-blocks / Available / Mounted on
fn parse_df_kp(stdout: &str) -> Result<SystemDiskSpace, AppError> {
    let line = stdout
        .lines()
        .skip(1)
        .find(|line| !line.trim().is_empty())
        .ok_or_else(|| AppError::new("INTERNAL", "磁盘空间输出为空"))?;

    let parts: Vec<&str> = line.split_whitespace().collect();
    // Filesystem 1024-blocks Used Available Capacity Mounted on
    if parts.len() < 6 {
        return Err(AppError::new("INTERNAL", "无法解析磁盘空间"));
    }

    let total_kb: u64 = parts[1]
        .parse()
        .map_err(|_| AppError::new("INTERNAL", "无法解析磁盘总大小"))?;
    let available_kb: u64 = parts[3]
        .parse()
        .map_err(|_| AppError::new("INTERNAL", "无法解析可用空间"))?;
    let mount = parts[5..].join(" ");

    Ok(SystemDiskSpace {
        path: mount,
        total_bytes: total_kb.saturating_mul(1024),
        available_bytes: available_kb.saturating_mul(1024),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_df_line() {
        let sample = "Filesystem 1024-blocks Used Available Capacity Mounted on\n\
/dev/disk3s1 239482880 220000000 10400000 96% /System/Volumes/Data\n";
        let result = parse_df_kp(sample).expect("parse");
        assert_eq!(result.path, "/System/Volumes/Data");
        assert_eq!(result.total_bytes, 239482880 * 1024);
        assert_eq!(result.available_bytes, 10400000 * 1024);
    }

    #[test]
    fn normalizes_arch() {
        assert_eq!(normalize_arch("aarch64"), "ARM64");
        assert_eq!(normalize_arch("x86_64"), "x64");
    }

    #[cfg(any(target_os = "macos", target_os = "linux"))]
    #[test]
    fn parses_ps_rss_pcpu() {
        let (rss, cpu) = parse_ps_rss_pcpu("  12345  3.5\n").expect("parse");
        assert_eq!(rss, 12345 * 1024);
        assert!((cpu - 3.5).abs() < f32::EPSILON);
    }
}

/// 在指定目录打开系统默认终端（参数数组，不拼 shell）
pub fn open_terminal(path: &str) -> Result<OkResult, AppError> {
    let dir = normalize_existing_dir(path)?;

    #[cfg(target_os = "macos")]
    {
        open_terminal_macos(&dir)?;
    }

    #[cfg(target_os = "windows")]
    {
        open_terminal_windows(&dir)?;
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        open_terminal_linux(&dir)?;
    }

    Ok(OkResult { ok: true })
}

/// 在文件管理器中打开目录（macOS Finder / Windows 资源管理器）
pub fn reveal_in_file_manager(path: &str) -> Result<OkResult, AppError> {
    let dir = normalize_existing_dir(path)?;

    #[cfg(target_os = "macos")]
    {
        // `open <dir>`：用 Finder 打开该文件夹
        let status = Command::new("open")
            .arg(&dir)
            .status()
            .map_err(|error| {
                AppError::new("INTERNAL", "无法打开访达").with_details(error.to_string())
            })?;
        if !status.success() {
            return Err(AppError::new("INTERNAL", "打开访达失败"));
        }
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(&dir)
            .spawn()
            .map_err(|error| {
                AppError::new("INTERNAL", "无法打开资源管理器").with_details(error.to_string())
            })?;
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let status = Command::new("xdg-open")
            .arg(&dir)
            .status()
            .map_err(|error| {
                AppError::new("INTERNAL", "无法打开文件管理器").with_details(error.to_string())
            })?;
        if !status.success() {
            return Err(AppError::new("INTERNAL", "打开文件管理器失败"));
        }
    }

    Ok(OkResult { ok: true })
}

/// 用本机编辑器打开目录（依次尝试常见编辑器）
pub fn open_in_editor(path: &str) -> Result<OkResult, AppError> {
    let dir = normalize_existing_dir(path)?;

    #[cfg(target_os = "macos")]
    {
        // 优先 Cursor，再 VS Code / 其它；均用 open -a，不拼 shell
        let apps = [
            "Cursor",
            "Visual Studio Code",
            "Code",
            "Trae",
            "Windsurf",
            "Sublime Text",
        ];
        for app in apps {
            let status = Command::new("open").args(["-a", app]).arg(&dir).status();
            if let Ok(status) = status {
                if status.success() {
                    return Ok(OkResult { ok: true });
                }
            }
        }
        // CLI 回退：code / cursor
        for bin in ["cursor", "code"] {
            if Command::new(bin).arg(&dir).spawn().is_ok() {
                return Ok(OkResult { ok: true });
            }
        }
        return Err(AppError::new(
            "INTERNAL",
            "未找到可用编辑器（可安装 Cursor 或 VS Code）",
        ));
    }

    #[cfg(target_os = "windows")]
    {
        for bin in ["cursor", "code"] {
            if Command::new(bin).arg(&dir).spawn().is_ok() {
                return Ok(OkResult { ok: true });
            }
        }
        return Err(AppError::new(
            "INTERNAL",
            "未找到可用编辑器（可安装 Cursor 或 VS Code）",
        ));
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        for bin in ["cursor", "code", "xdg-open"] {
            if Command::new(bin).arg(&dir).spawn().is_ok() {
                return Ok(OkResult { ok: true });
            }
        }
        return Err(AppError::new("INTERNAL", "未找到可用编辑器"));
    }
}

#[cfg(target_os = "macos")]
fn open_terminal_macos(dir: &Path) -> Result<(), AppError> {
    // `open -a Terminal <dir>`：新开终端窗口并 cd 到该目录
    let status = Command::new("open")
        .args(["-a", "Terminal"])
        .arg(dir)
        .status()
        .map_err(|error| {
            AppError::new("INTERNAL", "无法打开终端").with_details(error.to_string())
        })?;

    if !status.success() {
        return Err(AppError::new("INTERNAL", "打开 Terminal 失败"));
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn open_terminal_windows(dir: &Path) -> Result<(), AppError> {
    // 优先 Windows Terminal；失败再退回 cmd
    let wt = Command::new("wt").args(["-d"]).arg(dir).spawn();
    if wt.is_ok() {
        return Ok(());
    }

    Command::new("cmd")
        .args(["/C", "start", "cmd.exe", "/K"])
        .current_dir(dir)
        .spawn()
        .map_err(|error| {
            AppError::new("INTERNAL", "无法打开命令行").with_details(error.to_string())
        })?;
    Ok(())
}

#[cfg(all(unix, not(target_os = "macos")))]
fn open_terminal_linux(dir: &Path) -> Result<(), AppError> {
    let dir_str = dir.to_string_lossy();
    let candidates: [(&str, &[&str]); 5] = [
        ("x-terminal-emulator", &["--working-directory"]),
        ("gnome-terminal", &["--working-directory"]),
        ("konsole", &["--workdir"]),
        ("xfce4-terminal", &["--working-directory"]),
        ("xterm", &[]),
    ];

    for (bin, prefix) in candidates {
        let mut cmd = Command::new(bin);
        if prefix.is_empty() {
            cmd.current_dir(dir);
        } else {
            cmd.args(prefix).arg(dir_str.as_ref());
        }
        if cmd.spawn().is_ok() {
            return Ok(());
        }
    }

    Err(AppError::new(
        "INTERNAL",
        "未找到可用终端，请安装系统终端模拟器",
    ))
}
