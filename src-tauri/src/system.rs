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
    /// 线程数；当前平台取不到则为 null
    pub thread_count: Option<u32>,
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

/// 本进程轻量运行时指标（供设置「性能」约 1s 轮询）
pub fn runtime_stats() -> Result<SystemRuntimeStats, AppError> {
    let pid = std::process::id();
    let uptime_ms = process_start().elapsed().as_millis() as u64;
    let metrics = read_process_metrics(pid)?;
    Ok(SystemRuntimeStats {
        pid,
        rss_bytes: metrics.rss_bytes,
        cpu_percent: metrics.cpu_percent,
        uptime_ms,
        thread_count: metrics.thread_count,
    })
}

struct ProcessMetrics {
    rss_bytes: u64,
    cpu_percent: f32,
    thread_count: Option<u32>,
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn read_process_metrics(pid: u32) -> Result<ProcessMetrics, AppError> {
    // macOS 的 ps 无 thcount（带上会导致 exit 1，整次采样失败）；Linux 用 nlwp。
    let pid_arg = pid.to_string();
    #[cfg(target_os = "macos")]
    let args: [&str; 4] = ["-o", "rss=,pcpu=", "-p", &pid_arg];
    #[cfg(target_os = "linux")]
    let args: [&str; 4] = ["-o", "rss=,pcpu=,nlwp=", "-p", &pid_arg];

    let output = Command::new("ps").args(args).output().map_err(|error| {
        AppError::new("INTERNAL", "无法读取进程状态").with_details(error.to_string())
    })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::new("INTERNAL", "读取进程状态失败").with_details(stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_ps_metrics(&stdout)
}

/// 解析 `ps`：RSS 为 KB，pcpu 为百分比，可选线程数
#[cfg(any(target_os = "macos", target_os = "linux"))]
fn parse_ps_metrics(stdout: &str) -> Result<ProcessMetrics, AppError> {
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
    let thread_count = parts.get(2).and_then(|raw| raw.parse::<u32>().ok());
    Ok(ProcessMetrics {
        rss_bytes: rss_kb.saturating_mul(1024),
        cpu_percent,
        thread_count,
    })
}

#[cfg(target_os = "windows")]
fn read_process_metrics(pid: u32) -> Result<ProcessMetrics, AppError> {
    // WorkingSetSize 单位字节；CPU 百分比 Windows 侧不易瞬时取得，返回 0 由 UI 显示「—」
    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            &format!(
                "$p = Get-Process -Id {pid} -ErrorAction Stop; Write-Output \"$($p.WorkingSet64) $($p.Threads.Count)\""
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
    let parts: Vec<&str> = stdout.split_whitespace().collect();
    let rss_bytes: u64 = parts
        .first()
        .ok_or_else(|| AppError::new("INTERNAL", "无法解析进程内存"))?
        .parse()
        .map_err(|_| AppError::new("INTERNAL", "无法解析进程内存"))?;
    let thread_count = parts.get(1).and_then(|raw| raw.parse::<u32>().ok());
    Ok(ProcessMetrics {
        rss_bytes,
        cpu_percent: 0.0,
        thread_count,
    })
}

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
fn read_process_metrics(_pid: u32) -> Result<ProcessMetrics, AppError> {
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
    #[cfg(target_os = "windows")]
    if let Ok(profile) = std::env::var("USERPROFILE") {
        return PathBuf::from(profile);
    }
    #[cfg(target_os = "windows")]
    {
        return PathBuf::from("C:\\");
    }
    #[cfg(not(target_os = "windows"))]
    {
        PathBuf::from("/")
    }
}

/// 查询路径所在卷的磁盘空间
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

#[cfg(not(target_os = "windows"))]
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

#[cfg(target_os = "windows")]
fn disk_space_for_path(path: &Path) -> Result<SystemDiskSpace, AppError> {
    let path_str = path.to_string_lossy().replace('\'', "''");
    let script = format!(
        "$item = Get-Item -LiteralPath '{path_str}' -ErrorAction Stop; \
         $drive = $item.PSDrive; \
         if (-not $drive) {{ throw 'no drive' }}; \
         $total = [int64]$drive.Used + [int64]$drive.Free; \
         Write-Output \"$total $($drive.Free) $($drive.Name)\""
    );
    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", &script])
        .output()
        .map_err(|error| {
            AppError::new("INTERNAL", "无法读取磁盘空间").with_details(error.to_string())
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::new("INTERNAL", "读取磁盘空间失败").with_details(stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let line = stdout
        .lines()
        .find(|line| !line.trim().is_empty())
        .ok_or_else(|| AppError::new("INTERNAL", "磁盘空间输出为空"))?;
    let parts: Vec<&str> = line.split_whitespace().collect();
    if parts.len() < 3 {
        return Err(AppError::new("INTERNAL", "无法解析磁盘空间"));
    }
    let total_bytes: u64 = parts[0]
        .parse()
        .map_err(|_| AppError::new("INTERNAL", "无法解析磁盘总大小"))?;
    let available_bytes: u64 = parts[1]
        .parse()
        .map_err(|_| AppError::new("INTERNAL", "无法解析可用空间"))?;
    Ok(SystemDiskSpace {
        path: format!("{}:", parts[2]),
        total_bytes,
        available_bytes,
    })
}

/// 解析 `df -kP`：第二行起为数据；字段为 1024-blocks / Available / Mounted on
#[cfg(not(target_os = "windows"))]
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

    #[cfg(not(target_os = "windows"))]
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
    fn parses_ps_metrics() {
        let with_threads = parse_ps_metrics("  12345  3.5  12\n").expect("parse");
        assert_eq!(with_threads.rss_bytes, 12345 * 1024);
        assert!((with_threads.cpu_percent - 3.5).abs() < f32::EPSILON);
        assert_eq!(with_threads.thread_count, Some(12));

        let mac_style = parse_ps_metrics("  12345  3.5\n").expect("parse mac");
        assert_eq!(mac_style.rss_bytes, 12345 * 1024);
        assert_eq!(mac_style.thread_count, None);
    }
}

/// 在指定目录打开终端（参数数组，不拼 shell）
pub fn open_terminal(
    path: &str,
    preference: Option<&str>,
    custom_path: Option<&str>,
) -> Result<OkResult, AppError> {
    let dir = normalize_existing_dir(path)?;
    let pref = preference.unwrap_or("auto");

    if pref == "custom" {
        let custom = custom_path
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| AppError::new("INVALID_PATH", "请先在设置中填写自定义终端路径"))?;
        open_custom_tool(custom, &dir)?;
        return Ok(OkResult { ok: true });
    }

    #[cfg(target_os = "macos")]
    {
        open_terminal_macos(&dir, pref)?;
    }

    #[cfg(target_os = "windows")]
    {
        open_terminal_windows(&dir, pref)?;
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        open_terminal_linux(&dir, pref)?;
    }

    Ok(OkResult { ok: true })
}

/// 在文件管理器中打开目录（macOS Finder / Windows 资源管理器）
pub fn reveal_in_file_manager(path: &str) -> Result<OkResult, AppError> {
    let dir = normalize_existing_dir(path)?;

    #[cfg(target_os = "macos")]
    {
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

/// 用本机编辑器打开目录（支持设置偏好：auto / cursor / vscode / custom）
pub fn open_in_editor(
    path: &str,
    preference: Option<&str>,
    custom_path: Option<&str>,
) -> Result<OkResult, AppError> {
    let dir = normalize_existing_dir(path)?;
    let pref = preference.unwrap_or("auto");

    if pref == "custom" {
        let custom = custom_path
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| AppError::new("INVALID_PATH", "请先在设置中填写自定义编辑器路径"))?;
        open_custom_tool(custom, &dir)?;
        return Ok(OkResult { ok: true });
    }

    #[cfg(target_os = "macos")]
    {
        open_in_editor_macos(&dir, pref)?;
    }

    #[cfg(target_os = "windows")]
    {
        open_in_editor_windows(&dir, pref)?;
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        open_in_editor_linux(&dir, pref)?;
    }

    Ok(OkResult { ok: true })
}

/// 自定义可执行文件或 .app：参数数组传入目录，不拼 shell
fn open_custom_tool(custom: &str, dir: &Path) -> Result<(), AppError> {
    #[cfg(target_os = "macos")]
    {
        if custom.ends_with(".app") || custom.contains(".app/") {
            let status = Command::new("open")
                .args(["-a", custom])
                .arg(dir)
                .status()
                .map_err(|error| {
                    AppError::new("INTERNAL", "无法打开自定义应用").with_details(error.to_string())
                })?;
            if status.success() {
                return Ok(());
            }
            return Err(AppError::new("INTERNAL", "打开自定义应用失败"));
        }
    }

    Command::new(custom)
        .arg(dir)
        .spawn()
        .map_err(|error| {
            AppError::new("INTERNAL", "无法启动自定义程序").with_details(error.to_string())
        })?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn open_in_editor_macos(dir: &Path, preference: &str) -> Result<(), AppError> {
    let apps: &[&str] = match preference {
        "cursor" => &["Cursor"],
        "vscode" => &["Visual Studio Code", "Code"],
        _ => &[
            "Cursor",
            "Visual Studio Code",
            "Code",
            "Trae",
            "Windsurf",
            "Sublime Text",
        ],
    };
    for app in apps {
        let status = Command::new("open").args(["-a", app]).arg(dir).status();
        if let Ok(status) = status {
            if status.success() {
                return Ok(());
            }
        }
    }
    let bins: &[&str] = match preference {
        "cursor" => &["cursor"],
        "vscode" => &["code"],
        _ => &["cursor", "code"],
    };
    for bin in bins {
        if Command::new(bin).arg(dir).spawn().is_ok() {
            return Ok(());
        }
    }
    Err(AppError::new(
        "INTERNAL",
        "未找到可用编辑器（可安装 Cursor 或 VS Code）",
    ))
}

#[cfg(target_os = "windows")]
fn open_in_editor_windows(dir: &Path, preference: &str) -> Result<(), AppError> {
    let bins: &[&str] = match preference {
        "cursor" => &["cursor.cmd", "cursor.exe", "cursor"],
        "vscode" => &["code.cmd", "code.exe", "code"],
        _ => &[
            "cursor.cmd",
            "cursor.exe",
            "cursor",
            "code.cmd",
            "code.exe",
            "code",
        ],
    };
    for bin in bins {
        if Command::new(bin).arg(dir).spawn().is_ok() {
            return Ok(());
        }
    }
    Err(AppError::new(
        "INTERNAL",
        "未找到可用编辑器（可安装 Cursor 或 VS Code，并确保 CLI 在 PATH）",
    ))
}

#[cfg(all(unix, not(target_os = "macos")))]
fn open_in_editor_linux(dir: &Path, preference: &str) -> Result<(), AppError> {
    let bins: &[&str] = match preference {
        "cursor" => &["cursor"],
        "vscode" => &["code"],
        _ => &["cursor", "code", "xdg-open"],
    };
    for bin in bins {
        if Command::new(bin).arg(dir).spawn().is_ok() {
            return Ok(());
        }
    }
    Err(AppError::new("INTERNAL", "未找到可用编辑器"))
}

#[cfg(target_os = "macos")]
fn open_terminal_macos(dir: &Path, preference: &str) -> Result<(), AppError> {
    let app = match preference {
        "iterm" => "iTerm",
        "terminal" => "Terminal",
        _ => "Terminal",
    };
    let status = Command::new("open")
        .args(["-a", app])
        .arg(dir)
        .status()
        .map_err(|error| {
            AppError::new("INTERNAL", "无法打开终端").with_details(error.to_string())
        })?;

    if !status.success() {
        return Err(AppError::new("INTERNAL", "打开终端失败"));
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn open_terminal_windows(dir: &Path, preference: &str) -> Result<(), AppError> {
    match preference {
        "cmd" => {
            Command::new("cmd")
                .args(["/C", "start", "cmd.exe", "/K"])
                .current_dir(dir)
                .spawn()
                .map_err(|error| {
                    AppError::new("INTERNAL", "无法打开命令行").with_details(error.to_string())
                })?;
            Ok(())
        }
        "wt" => {
            Command::new("wt")
                .args(["-d"])
                .arg(dir)
                .spawn()
                .map_err(|error| {
                    AppError::new("INTERNAL", "无法打开 Windows Terminal")
                        .with_details(error.to_string())
                })?;
            Ok(())
        }
        _ => {
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
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
fn open_terminal_linux(dir: &Path, preference: &str) -> Result<(), AppError> {
    let dir_str = dir.to_string_lossy();
    let candidates: Vec<(&str, &[&str])> = match preference {
        "gnome-terminal" => vec![("gnome-terminal", &["--working-directory"])],
        "konsole" => vec![("konsole", &["--workdir"])],
        _ => vec![
            ("x-terminal-emulator", &["--working-directory"]),
            ("gnome-terminal", &["--working-directory"]),
            ("konsole", &["--workdir"]),
            ("xfce4-terminal", &["--working-directory"]),
            ("xterm", &[]),
        ],
    };

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
