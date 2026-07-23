//! Windows 系统指标：Win32 API，不拉起 powershell/cmd（避免控制台闪窗）。

use std::mem::{size_of, zeroed};
use std::path::Path;
use std::sync::Mutex;
use std::time::Instant;

use windows_sys::Win32::Foundation::{CloseHandle, FILETIME, HANDLE, INVALID_HANDLE_VALUE};
use windows_sys::Win32::Storage::FileSystem::{
    GetDiskFreeSpaceExW, GetDriveTypeW, GetLogicalDriveStringsW, DRIVE_FIXED, DRIVE_RAMDISK,
    DRIVE_REMOTE, DRIVE_REMOVABLE,
};
use windows_sys::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Thread32First, Thread32Next, TH32CS_SNAPTHREAD, THREADENTRY32,
};
use windows_sys::Win32::System::ProcessStatus::{
    GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS,
};
use windows_sys::Win32::System::Threading::{
    GetCurrentProcess, GetProcessTimes, OpenProcess, PROCESS_QUERY_INFORMATION,
    PROCESS_VM_READ,
};

use crate::error::AppError;
use crate::system::{ProcessMetrics, SystemDiskSpace};

struct CpuSample {
    wall: Instant,
    /// 进程内核+用户时间，单位 100ns
    cpu_100ns: u64,
}

static LAST_CPU_SAMPLE: Mutex<Option<CpuSample>> = Mutex::new(None);

fn filetime_to_u64(ft: FILETIME) -> u64 {
    (u64::from(ft.dwHighDateTime) << 32) | u64::from(ft.dwLowDateTime)
}

fn close_handle(handle: HANDLE) {
    unsafe {
        let _ = CloseHandle(handle);
    }
}

/// 本进程 RSS / CPU% / 线程数（无子进程）
pub fn read_process_metrics(pid: u32) -> Result<ProcessMetrics, AppError> {
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, 0, pid);
        if handle == 0 || handle == INVALID_HANDLE_VALUE {
            // 部分环境权限不足时回退当前进程伪句柄
            let current = GetCurrentProcess();
            return read_metrics_from_handle(current, pid, false);
        }
        let result = read_metrics_from_handle(handle, pid, true);
        close_handle(handle);
        result
    }
}

unsafe fn read_metrics_from_handle(
    handle: HANDLE,
    pid: u32,
    _owned: bool,
) -> Result<ProcessMetrics, AppError> {
    let mut counters: PROCESS_MEMORY_COUNTERS = zeroed();
    counters.cb = size_of::<PROCESS_MEMORY_COUNTERS>() as u32;
    let ok = GetProcessMemoryInfo(handle, &mut counters, counters.cb);
    if ok == 0 {
        return Err(AppError::new("INTERNAL", "无法读取进程内存"));
    }

    let mut creation: FILETIME = zeroed();
    let mut exit: FILETIME = zeroed();
    let mut kernel: FILETIME = zeroed();
    let mut user: FILETIME = zeroed();
    let times_ok = GetProcessTimes(handle, &mut creation, &mut exit, &mut kernel, &mut user);
    let cpu_percent = if times_ok != 0 {
        compute_cpu_percent(filetime_to_u64(kernel).saturating_add(filetime_to_u64(user)))
    } else {
        0.0
    };

    Ok(ProcessMetrics {
        rss_bytes: counters.WorkingSetSize as u64,
        cpu_percent,
        thread_count: count_threads(pid),
    })
}

fn compute_cpu_percent(cpu_100ns: u64) -> f32 {
    let now = Instant::now();
    let mut guard = match LAST_CPU_SAMPLE.lock() {
        Ok(g) => g,
        Err(poisoned) => poisoned.into_inner(),
    };
    let percent = if let Some(prev) = guard.as_ref() {
        let wall_ns = now.duration_since(prev.wall).as_nanos() as f64;
        let cpu_delta_ns = cpu_100ns.saturating_sub(prev.cpu_100ns) as f64 * 100.0;
        if wall_ns > 0.0 {
            ((cpu_delta_ns / wall_ns) * 100.0).clamp(0.0, 800.0) as f32
        } else {
            0.0
        }
    } else {
        0.0
    };
    *guard = Some(CpuSample {
        wall: now,
        cpu_100ns,
    });
    percent
}

fn count_threads(pid: u32) -> Option<u32> {
    unsafe {
        let snap = CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0);
        if snap == INVALID_HANDLE_VALUE || snap == 0 {
            return None;
        }
        let mut entry: THREADENTRY32 = zeroed();
        entry.dwSize = size_of::<THREADENTRY32>() as u32;
        let mut count = 0u32;
        if Thread32First(snap, &mut entry) != 0 {
            loop {
                if entry.th32OwnerProcessID == pid {
                    count = count.saturating_add(1);
                }
                if Thread32Next(snap, &mut entry) == 0 {
                    break;
                }
            }
        }
        close_handle(snap);
        if count == 0 {
            None
        } else {
            Some(count)
        }
    }
}

/// 路径所在卷的磁盘空间（GetDiskFreeSpaceExW）
pub fn disk_space_for_path(path: &Path) -> Result<SystemDiskSpace, AppError> {
    let root = volume_root(path);
    disk_space_for_root(&root)
}

/// 枚举固定盘 / 可移动 / 网络 / RAM 盘（跳过光驱与未就绪卷）
pub fn list_disk_volumes() -> Result<Vec<SystemDiskSpace>, AppError> {
    let mut buffer = vec![0u16; 512];
    let written = unsafe { GetLogicalDriveStringsW(buffer.len() as u32, buffer.as_mut_ptr()) };
    if written == 0 || written as usize >= buffer.len() {
        return Err(AppError::new("INTERNAL", "无法枚举磁盘卷"));
    }

    let mut volumes = Vec::new();
    let mut start = 0usize;
    let end = written as usize;
    while start < end {
        if buffer[start] == 0 {
            break;
        }
        let mut next = start;
        while next < end && buffer[next] != 0 {
            next += 1;
        }
        let drive = String::from_utf16_lossy(&buffer[start..next]);
        start = next + 1;

        let wide = to_wide_null(&drive);
        let drive_type = unsafe { GetDriveTypeW(wide.as_ptr()) };
        if !matches!(
            drive_type,
            DRIVE_FIXED | DRIVE_REMOVABLE | DRIVE_REMOTE | DRIVE_RAMDISK
        ) {
            continue;
        }
        if let Ok(space) = disk_space_for_root(&drive) {
            if space.total_bytes > 0 {
                volumes.push(space);
            }
        }
    }
    Ok(volumes)
}

fn disk_space_for_root(root: &str) -> Result<SystemDiskSpace, AppError> {
    let wide = to_wide_null(root);
    let mut free_available: u64 = 0;
    let mut total: u64 = 0;
    let mut total_free: u64 = 0;
    let ok = unsafe {
        GetDiskFreeSpaceExW(
            wide.as_ptr(),
            &mut free_available,
            &mut total,
            &mut total_free,
        )
    };
    if ok == 0 {
        return Err(AppError::new("INTERNAL", "无法读取磁盘空间"));
    }
    Ok(SystemDiskSpace {
        path: root.to_string(),
        total_bytes: total,
        available_bytes: free_available,
    })
}

fn volume_root(path: &Path) -> String {
    let s = path.to_string_lossy();
    // `C:\...` → `C:\`
    if let Some(rest) = s.strip_prefix('\\') {
        // UNC `\\server\share\...` → `\\server\share\`
        if rest.starts_with('\\') {
            let parts: Vec<&str> = s.trim_start_matches('\\').split('\\').collect();
            if parts.len() >= 2 {
                return format!("\\\\{}\\{}\\", parts[0], parts[1]);
            }
        }
    }
    if s.len() >= 2 && s.as_bytes()[1] == b':' {
        let drive = s.chars().next().unwrap_or('C');
        return format!("{drive}:\\");
    }
    "C:\\".to_string()
}

fn to_wide_null(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}
