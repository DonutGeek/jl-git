use font_kit::source::SystemSource;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;
use std::time::Instant;

use crate::error::AppError;
use crate::git::path::{normalize_existing_dir, normalize_existing_path};
use std::fs;

/// 交给访达 / 资源管理器 / xdg-open 的路径：去掉 Windows `\\?\` 前缀
fn path_for_shell(path: &Path) -> String {
    let raw = path.to_string_lossy();
    #[cfg(windows)]
    {
        let trimmed = raw.strip_prefix(r"\\?\").unwrap_or(raw.as_ref());
        if let Some(unc) = trimmed.strip_prefix(r"UNC\") {
            return format!(r"\\{unc}");
        }
        return trimmed.to_string();
    }
    #[cfg(not(windows))]
    {
        raw.into_owned()
    }
}

/// 将绝对路径编码为 file:// URI（Linux FileManager1.ShowItems）
#[cfg(all(unix, not(target_os = "macos")))]
fn path_to_file_uri(path: &Path) -> String {
    let mut uri = String::from("file://");
    for byte in path.as_os_str().as_encoded_bytes() {
        match byte {
            b'A'..=b'Z'
            | b'a'..=b'z'
            | b'0'..=b'9'
            | b'/'
            | b'-'
            | b'_'
            | b'.'
            | b'~' => uri.push(char::from(*byte)),
            _ => uri.push_str(&format!("%{byte:02X}")),
        }
    }
    uri
}

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

pub(crate) struct ProcessMetrics {
    pub(crate) rss_bytes: u64,
    pub(crate) cpu_percent: f32,
    pub(crate) thread_count: Option<u32>,
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

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn read_process_metrics(pid: u32) -> Result<ProcessMetrics, AppError> {
    // macOS 的 ps 无 thcount（带上会导致 exit 1，整次采样失败）；Linux 用 nlwp。
    let pid_arg = pid.to_string();
    #[cfg(target_os = "macos")]
    let args: [&str; 4] = ["-o", "rss=,pcpu=", "-p", &pid_arg];
    #[cfg(target_os = "linux")]
    let args: [&str; 4] = ["-o", "rss=,pcpu=,nlwp=", "-p", &pid_arg];

    let mut command = Command::new("ps");
    crate::process_cmd::configure_background_command(&mut command);
    let output = command.args(args).output().map_err(|error| {
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
    crate::system_windows::read_process_metrics(pid)
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

/// 枚举本机可见卷（Win 盘符 / Unix 真实挂载），供状态栏 hover 多盘展示
pub fn list_disk_volumes() -> Result<Vec<SystemDiskSpace>, AppError> {
    #[cfg(target_os = "windows")]
    {
        return crate::system_windows::list_disk_volumes();
    }
    #[cfg(not(target_os = "windows"))]
    {
        let output = Command::new("df")
            .args(["-kP"])
            .output()
            .map_err(|error| {
                AppError::new("INTERNAL", "无法读取磁盘空间").with_details(error.to_string())
            })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(AppError::new("INTERNAL", "读取磁盘空间失败").with_details(stderr));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        Ok(parse_df_kp_all(&stdout))
    }
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
    crate::system_windows::disk_space_for_path(path)
}

/// 解析单路径 `df -kP`：取第一条数据行（不做伪卷过滤）
#[cfg(not(target_os = "windows"))]
fn parse_df_kp(stdout: &str) -> Result<SystemDiskSpace, AppError> {
    let line = stdout
        .lines()
        .skip(1)
        .find(|line| !line.trim().is_empty())
        .ok_or_else(|| AppError::new("INTERNAL", "磁盘空间输出为空"))?;

    parse_df_data_line(line).ok_or_else(|| AppError::new("INTERNAL", "无法解析磁盘空间"))
}

#[cfg(not(target_os = "windows"))]
fn parse_df_data_line(line: &str) -> Option<SystemDiskSpace> {
    let parts: Vec<&str> = line.split_whitespace().collect();
    // Filesystem 1024-blocks Used Available Capacity Mounted on
    if parts.len() < 6 {
        return None;
    }
    let total_kb: u64 = parts[1].parse().ok()?;
    let available_kb: u64 = parts[3].parse().ok()?;
    let mount = parts[5..].join(" ");
    Some(SystemDiskSpace {
        path: mount,
        total_bytes: total_kb.saturating_mul(1024),
        available_bytes: available_kb.saturating_mul(1024),
    })
}

/// 解析全部 `df -kP` 行，过滤伪文件系统与空卷
#[cfg(not(target_os = "windows"))]
fn parse_df_kp_all(stdout: &str) -> Vec<SystemDiskSpace> {
    let mut volumes = Vec::new();
    for line in stdout.lines().skip(1) {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 6 {
            continue;
        }
        let fs = parts[0];
        let mount = parts[5..].join(" ");
        if is_pseudo_volume(fs, &mount) {
            continue;
        }
        let Some(space) = parse_df_data_line(line) else {
            continue;
        };
        // 忽略极小卷（典型伪挂载）
        if space.total_bytes < 1024 * 1024 {
            continue;
        }
        volumes.push(space);
    }
    refine_unix_volumes(volumes)
}

/// macOS APFS 会把同一容器拆成 / 与 Data 等多挂载；/Volumes 下小镜像也不当独立「盘」
#[cfg(not(target_os = "windows"))]
fn refine_unix_volumes(volumes: Vec<SystemDiskSpace>) -> Vec<SystemDiskSpace> {
    let has_data = volumes
        .iter()
        .any(|volume| volume.path == "/System/Volumes/Data");

    let mut filtered: Vec<SystemDiskSpace> = volumes
        .into_iter()
        .filter(|volume| {
            let path = volume.path.as_str();
            // 有 Data 时去掉根分区（同源容量，用户看到会像「多盘符」）
            if has_data && path == "/" {
                return false;
            }
            // 其余 System Volumes 对用户无意义
            if path.starts_with("/System/Volumes/") && path != "/System/Volumes/Data" {
                return false;
            }
            // /Volumes/* 小于 1GB 多为 dmg / 安装镜像，不算外置盘
            if path.starts_with("/Volumes/") && volume.total_bytes < 1_073_741_824 {
                return false;
            }
            true
        })
        .collect();

    // 相同总容量+可用 → 视为同一物理盘，只留优先路径
    filtered.sort_by(|left, right| {
        volume_path_rank(&left.path)
            .cmp(&volume_path_rank(&right.path))
            .then_with(|| left.path.cmp(&right.path))
    });
    let mut deduped: Vec<SystemDiskSpace> = Vec::new();
    for volume in filtered {
        let duplicate = deduped.iter().any(|existing| {
            existing.total_bytes == volume.total_bytes
                && existing.available_bytes == volume.available_bytes
        });
        if !duplicate {
            deduped.push(volume);
        }
    }
    deduped
}

#[cfg(not(target_os = "windows"))]
fn volume_path_rank(path: &str) -> u8 {
    if path == "/System/Volumes/Data" {
        return 0;
    }
    if path == "/" {
        return 1;
    }
    if path.starts_with("/Volumes/") {
        return 2;
    }
    3
}

#[cfg(not(target_os = "windows"))]
fn is_pseudo_volume(filesystem: &str, mount: &str) -> bool {
    let fs = filesystem.to_ascii_lowercase();
    if matches!(
        fs.as_str(),
        "tmpfs"
            | "devtmpfs"
            | "devfs"
            | "proc"
            | "sysfs"
            | "cgroup"
            | "cgroup2"
            | "squashfs"
            | "overlay"
            | "efivarfs"
            | "tracefs"
            | "debugfs"
            | "securityfs"
            | "pstore"
            | "bpf"
            | "mqueue"
            | "hugetlbfs"
            | "configfs"
            | "fusectl"
            | "rpc_pipefs"
            | "autofs"
            | "none"
    ) || fs.starts_with("map")
        || fs.contains("tmpfs")
    {
        return true;
    }
    matches!(
        mount,
        "/dev"
            | "/dev/shm"
            | "/run"
            | "/sys"
            | "/proc"
            | "/boot/efi"
            | "/System/Volumes/VM"
            | "/System/Volumes/Preboot"
            | "/System/Volumes/Update"
            | "/private/var/vm"
    ) || mount.starts_with("/System/Volumes/xarts")
        || mount.starts_with("/System/Volumes/iSCPreboot")
        || mount.starts_with("/System/Volumes/Hardware")
        || mount.starts_with("/System/Volumes/Update")
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

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn parses_df_all_filters_pseudo() {
        let sample = "Filesystem 1024-blocks Used Available Capacity Mounted on\n\
/dev/disk3s1s1 239482880 220000000 10400000 96% /\n\
/dev/disk3s5 239482880 220000000 10400000 96% /System/Volumes/Data\n\
tmpfs 102400 0 102400 0% /dev/shm\n\
/dev/disk3s1 239482880 220000000 10400000 96% /System/Volumes/VM\n\
/dev/disk4s1 48000 24000 24000 50% /Volumes/鲸灵Git\n\
/dev/sdb1 104857600 52428800 52428800 50% /mnt/data\n";
        let volumes = parse_df_kp_all(sample);
        // Data 保留；/ 与 Data 同源去掉；小 dmg 去掉；Linux 外置盘保留
        assert_eq!(volumes.len(), 2);
        assert_eq!(volumes[0].path, "/System/Volumes/Data");
        assert_eq!(volumes[1].path, "/mnt/data");
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

/// 在文件管理器中显示路径（目录打开；文件则选中）
pub fn reveal_in_file_manager(path: &str) -> Result<OkResult, AppError> {
    let target = normalize_existing_path(path)?;
    let path_str = path_for_shell(&target);

    #[cfg(target_os = "macos")]
    {
        let mut cmd = Command::new("open");
        if target.is_file() {
            cmd.arg("-R");
        }
        let status = cmd.arg(&path_str).status().map_err(|error| {
            AppError::new("INTERNAL", "无法打开访达").with_details(error.to_string())
        })?;
        if !status.success() {
            return Err(AppError::new("INTERNAL", "打开访达失败"));
        }
    }

    #[cfg(target_os = "windows")]
    {
        // `/select,` 须与路径同属一个参数；去掉 `\\?\` 以免资源管理器无法定位
        if target.is_file() {
            Command::new("explorer")
                .arg(format!("/select,{path_str}"))
                .spawn()
                .map_err(|error| {
                    AppError::new("INTERNAL", "无法打开资源管理器").with_details(error.to_string())
                })?;
        } else {
            Command::new("explorer")
                .arg(&path_str)
                .spawn()
                .map_err(|error| {
                    AppError::new("INTERNAL", "无法打开资源管理器").with_details(error.to_string())
                })?;
        }
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        reveal_in_file_manager_linux(&target)?;
    }

    Ok(OkResult { ok: true })
}

#[cfg(all(unix, not(target_os = "macos")))]
fn reveal_in_file_manager_linux(target: &Path) -> Result<(), AppError> {
    // 优先 FileManager1.ShowItems：多数桌面可打开并选中文件
    if target.is_file() {
        let uri = path_to_file_uri(target);
        let status = Command::new("dbus-send")
            .args([
                "--session",
                "--dest=org.freedesktop.FileManager1",
                "--type=method_call",
                "/org/freedesktop/FileManager1",
                "org.freedesktop.FileManager1.ShowItems",
                &format!("array:string:{uri}"),
                "string:",
            ])
            .status();
        if matches!(status, Ok(s) if s.success()) {
            return Ok(());
        }
    }

    let open_target = if target.is_file() {
        target.parent().unwrap_or(target)
    } else {
        target
    };
    let status = Command::new("xdg-open")
        .arg(open_target)
        .status()
        .map_err(|error| {
            AppError::new("INTERNAL", "无法打开文件管理器").with_details(error.to_string())
        })?;
    if !status.success() {
        return Err(AppError::new("INTERNAL", "打开文件管理器失败"));
    }
    Ok(())
}

/// 用本机编辑器打开文件或目录（支持设置偏好：auto / cursor / vscode / custom）
pub fn open_in_editor(
    path: &str,
    preference: Option<&str>,
    custom_path: Option<&str>,
) -> Result<OkResult, AppError> {
    let target = normalize_existing_path(path)?;
    // Windows 下去掉 `\\?\`，避免部分编辑器 CLI 无法打开
    let target = PathBuf::from(path_for_shell(&target));
    let pref = preference.unwrap_or("auto");

    if pref == "custom" {
        let custom = custom_path
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| AppError::new("INVALID_PATH", "请先在设置中填写自定义编辑器路径"))?;
        open_custom_tool(custom, &target)?;
        return Ok(OkResult { ok: true });
    }

    #[cfg(target_os = "macos")]
    {
        open_in_editor_macos(&target, pref)?;
    }

    #[cfg(target_os = "windows")]
    {
        open_in_editor_windows(&target, pref)?;
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        open_in_editor_linux(&target, pref)?;
    }

    Ok(OkResult { ok: true })
}

/// 将文本写入用户选定的绝对路径（导出等；不拼 shell）
pub fn write_text_file(path: &str, contents: &str) -> Result<OkResult, AppError> {
    let target = PathBuf::from(path.trim());
    if path.trim().is_empty() || !target.is_absolute() {
        return Err(AppError::new("INVALID_PATH", "须为绝对路径"));
    }
    if let Some(parent) = target.parent() {
        if !parent.as_os_str().is_empty() && !parent.is_dir() {
            return Err(AppError::new("INVALID_PATH", "目标目录不存在"));
        }
    }
    fs::write(&target, contents.as_bytes()).map_err(|error| {
        AppError::new("INTERNAL", "写入文件失败").with_details(error.to_string())
    })?;
    Ok(OkResult { ok: true })
}

/// 使用系统默认程序打开文件或目录
pub fn open_with_default_app(path: &str) -> Result<OkResult, AppError> {
    let target = normalize_existing_path(path)?;
    let path_str = path_for_shell(&target);

    #[cfg(target_os = "macos")]
    {
        let status = Command::new("open")
            .arg(&path_str)
            .status()
            .map_err(|error| {
                AppError::new("INTERNAL", "无法使用默认程序打开").with_details(error.to_string())
            })?;
        if !status.success() {
            return Err(AppError::new("INTERNAL", "使用默认程序打开失败"));
        }
    }

    #[cfg(target_os = "windows")]
    {
        // `start "" <path>`：空标题避免路径被当成窗口标题；去掉 `\\?\`
        let mut command = Command::new("cmd");
        crate::process_cmd::configure_background_command(&mut command);
        command
            .args(["/C", "start", "", &path_str])
            .spawn()
            .map_err(|error| {
                AppError::new("INTERNAL", "无法使用默认程序打开").with_details(error.to_string())
            })?;
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let status = Command::new("xdg-open")
            .arg(&path_str)
            .status()
            .map_err(|error| {
                AppError::new("INTERNAL", "无法使用默认程序打开").with_details(error.to_string())
            })?;
        if !status.success() {
            return Err(AppError::new("INTERNAL", "使用默认程序打开失败"));
        }
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

    let mut command = Command::new(custom);
    crate::process_cmd::configure_background_command(&mut command);
    command.arg(dir).spawn().map_err(|error| {
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
        let mut command = Command::new(bin);
        crate::process_cmd::configure_background_command(&mut command);
        if command.arg(dir).spawn().is_ok() {
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
