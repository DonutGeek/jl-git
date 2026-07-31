//! 探测本机已安装浏览器，并按偏好打开 HTTP(S) URL。
//! 仅检查已知路径 / 应用名，不引入探测 crate；参数数组调用，不拼 shell。

use serde::Serialize;
use std::path::PathBuf;
use std::process::Command;

#[cfg(target_os = "windows")]
use std::path::Path;

use crate::error::AppError;
use crate::system::OkResult;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemBrowser {
    pub id: String,
    pub name: String,
}

/// 校验仅允许 http / https；拒绝空白与引号，避免命令行注入面。
fn validate_http_url(raw: &str) -> Result<String, AppError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(AppError::new("VALIDATION", "地址不能为空"));
    }
    if trimmed.chars().any(|c| c.is_control() || c == '"' || c == '\'') {
        return Err(AppError::new("VALIDATION", "地址含非法字符"));
    }
    let lower = trimmed.to_ascii_lowercase();
    if !lower.starts_with("http://") && !lower.starts_with("https://") {
        return Err(AppError::new("VALIDATION", "仅支持打开 HTTP(S) 地址"));
    }
    Ok(trimmed.to_string())
}

/// 列出本机已探测到的浏览器（不含 auto / custom；由前端补全）
pub fn list_browsers() -> Result<Vec<SystemBrowser>, AppError> {
    #[cfg(target_os = "macos")]
    {
        return Ok(list_browsers_macos());
    }
    #[cfg(target_os = "windows")]
    {
        return Ok(list_browsers_windows());
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        return Ok(list_browsers_linux());
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", unix)))]
    {
        Ok(vec![])
    }
}

/// 用偏好浏览器打开 URL：`auto` = 系统默认；`custom` 用 custom_path
pub fn open_url(
    url: &str,
    preference: Option<&str>,
    custom_path: Option<&str>,
) -> Result<OkResult, AppError> {
    let url = validate_http_url(url)?;
    let pref = preference.unwrap_or("auto");

    if pref == "custom" {
        let custom = custom_path
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| AppError::new("INVALID_PATH", "请先在设置中填写自定义浏览器路径"))?;
        open_with_custom(custom, &url)?;
        return Ok(OkResult { ok: true });
    }

    if pref == "auto" {
        open_with_default(&url)?;
        return Ok(OkResult { ok: true });
    }

    #[cfg(target_os = "macos")]
    {
        open_with_id_macos(pref, &url)?;
    }
    #[cfg(target_os = "windows")]
    {
        open_with_id_windows(pref, &url)?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        open_with_id_linux(pref, &url)?;
    }

    Ok(OkResult { ok: true })
}

fn open_with_custom(custom: &str, url: &str) -> Result<(), AppError> {
    #[cfg(target_os = "macos")]
    {
        if custom.ends_with(".app") || custom.contains(".app/") {
            let status = Command::new("open")
                .args(["-a", custom, url])
                .status()
                .map_err(|error| {
                    AppError::new("INTERNAL", "无法打开自定义浏览器").with_details(error.to_string())
                })?;
            if status.success() {
                return Ok(());
            }
            return Err(AppError::new("INTERNAL", "打开自定义浏览器失败"));
        }
    }

    let mut command = Command::new(custom);
    crate::process_cmd::configure_background_command(&mut command);
    command.arg(url).spawn().map_err(|error| {
        AppError::new("INTERNAL", "无法启动自定义浏览器").with_details(error.to_string())
    })?;
    Ok(())
}

fn open_with_default(url: &str) -> Result<(), AppError> {
    #[cfg(target_os = "macos")]
    {
        let status = Command::new("open").arg(url).status().map_err(|error| {
            AppError::new("INTERNAL", "无法打开默认浏览器").with_details(error.to_string())
        })?;
        if !status.success() {
            return Err(AppError::new("INTERNAL", "打开默认浏览器失败"));
        }
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        // FileProtocolHandler：避免 `cmd /C start` 对 URL 中 & 等字符二次解析
        let mut command = Command::new("rundll32");
        crate::process_cmd::configure_background_command(&mut command);
        command
            .args(["url.dll,FileProtocolHandler", url])
            .spawn()
            .map_err(|error| {
                AppError::new("INTERNAL", "无法打开默认浏览器").with_details(error.to_string())
            })?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let status = Command::new("xdg-open").arg(url).status().map_err(|error| {
            AppError::new("INTERNAL", "无法打开默认浏览器").with_details(error.to_string())
        })?;
        if !status.success() {
            return Err(AppError::new("INTERNAL", "打开默认浏览器失败"));
        }
        return Ok(());
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", unix)))]
    {
        let _ = url;
        Err(AppError::new("INTERNAL", "当前平台不支持打开浏览器"))
    }
}

#[cfg(target_os = "macos")]
fn list_browsers_macos() -> Vec<SystemBrowser> {
    const CANDIDATES: &[(&str, &str, &str)] = &[
        ("safari", "Safari", "Safari.app"),
        ("chrome", "Google Chrome", "Google Chrome.app"),
        ("firefox", "Firefox", "Firefox.app"),
        ("edge", "Microsoft Edge", "Microsoft Edge.app"),
        ("brave", "Brave", "Brave Browser.app"),
        ("arc", "Arc", "Arc.app"),
        ("opera", "Opera", "Opera.app"),
    ];
    let mut out = Vec::new();
    for (id, name, bundle) in CANDIDATES {
        if macos_app_exists(bundle) {
            out.push(SystemBrowser {
                id: (*id).to_string(),
                name: (*name).to_string(),
            });
        }
    }
    out
}

#[cfg(target_os = "macos")]
fn macos_app_exists(bundle: &str) -> bool {
    let roots = [
        PathBuf::from("/Applications"),
        PathBuf::from("/System/Applications"),
        dirs_home().map(|h| h.join("Applications")).unwrap_or_default(),
    ];
    roots.iter().any(|root| {
        if root.as_os_str().is_empty() {
            return false;
        }
        root.join(bundle).is_dir()
    })
}

#[cfg(target_os = "macos")]
fn open_with_id_macos(id: &str, url: &str) -> Result<(), AppError> {
    let app = match id {
        "safari" => "Safari",
        "chrome" => "Google Chrome",
        "firefox" => "Firefox",
        "edge" => "Microsoft Edge",
        "brave" => "Brave Browser",
        "arc" => "Arc",
        "opera" => "Opera",
        _ => {
            return Err(AppError::new("VALIDATION", "未知的浏览器偏好").with_details(id.to_string()));
        }
    };
    let status = Command::new("open")
        .args(["-a", app, url])
        .status()
        .map_err(|error| {
            AppError::new("INTERNAL", "无法打开浏览器").with_details(error.to_string())
        })?;
    if !status.success() {
        return Err(AppError::new("INTERNAL", "打开浏览器失败").with_details(app.to_string()));
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn list_browsers_windows() -> Vec<SystemBrowser> {
    const CANDIDATES: &[(&str, &str, &[&str])] = &[
        (
            "chrome",
            "Google Chrome",
            &[
                r"C:\Program Files\Google\Chrome\Application\chrome.exe",
                r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            ],
        ),
        (
            "edge",
            "Microsoft Edge",
            &[
                r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
                r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
            ],
        ),
        (
            "firefox",
            "Firefox",
            &[
                r"C:\Program Files\Mozilla Firefox\firefox.exe",
                r"C:\Program Files (x86)\Mozilla Firefox\firefox.exe",
            ],
        ),
        (
            "brave",
            "Brave",
            &[
                r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe",
                r"C:\Program Files (x86)\BraveSoftware\Brave-Browser\Application\brave.exe",
            ],
        ),
        (
            "opera",
            "Opera",
            &[
                r"C:\Program Files\Opera\opera.exe",
                r"C:\Program Files (x86)\Opera\opera.exe",
            ],
        ),
    ];
    let mut out = Vec::new();
    for (id, name, paths) in CANDIDATES {
        if paths.iter().any(|path| Path::new(path).is_file()) {
            out.push(SystemBrowser {
                id: (*id).to_string(),
                name: (*name).to_string(),
            });
        }
    }
    out
}

#[cfg(target_os = "windows")]
fn open_with_id_windows(id: &str, url: &str) -> Result<(), AppError> {
    let paths: &[&str] = match id {
        "chrome" => &[
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        ],
        "edge" => &[
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        ],
        "firefox" => &[
            r"C:\Program Files\Mozilla Firefox\firefox.exe",
            r"C:\Program Files (x86)\Mozilla Firefox\firefox.exe",
        ],
        "brave" => &[
            r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe",
            r"C:\Program Files (x86)\BraveSoftware\Brave-Browser\Application\brave.exe",
        ],
        "opera" => &[
            r"C:\Program Files\Opera\opera.exe",
            r"C:\Program Files (x86)\Opera\opera.exe",
        ],
        _ => {
            return Err(AppError::new("VALIDATION", "未知的浏览器偏好").with_details(id.to_string()));
        }
    };
    for path in paths {
        if !Path::new(path).is_file() {
            continue;
        }
        let mut command = Command::new(path);
        crate::process_cmd::configure_background_command(&mut command);
        if command.arg(url).spawn().is_ok() {
            return Ok(());
        }
    }
    Err(AppError::new("INTERNAL", "未找到可用浏览器可执行文件"))
}

#[cfg(all(unix, not(target_os = "macos")))]
fn list_browsers_linux() -> Vec<SystemBrowser> {
    const CANDIDATES: &[(&str, &str, &[&str])] = &[
        ("chrome", "Google Chrome", &["google-chrome-stable", "google-chrome"]),
        ("chromium", "Chromium", &["chromium-browser", "chromium"]),
        ("firefox", "Firefox", &["firefox"]),
        ("edge", "Microsoft Edge", &["microsoft-edge", "microsoft-edge-stable"]),
        ("brave", "Brave", &["brave-browser", "brave"]),
        ("opera", "Opera", &["opera"]),
    ];
    let mut out = Vec::new();
    for (id, name, bins) in CANDIDATES {
        if bins.iter().any(|bin| linux_bin_exists(bin)) {
            out.push(SystemBrowser {
                id: (*id).to_string(),
                name: (*name).to_string(),
            });
        }
    }
    out
}

#[cfg(all(unix, not(target_os = "macos")))]
fn linux_bin_exists(bin: &str) -> bool {
    Command::new("which")
        .arg(bin)
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

#[cfg(all(unix, not(target_os = "macos")))]
fn open_with_id_linux(id: &str, url: &str) -> Result<(), AppError> {
    let bins: &[&str] = match id {
        "chrome" => &["google-chrome-stable", "google-chrome"],
        "chromium" => &["chromium-browser", "chromium"],
        "firefox" => &["firefox"],
        "edge" => &["microsoft-edge", "microsoft-edge-stable"],
        "brave" => &["brave-browser", "brave"],
        "opera" => &["opera"],
        _ => {
            return Err(AppError::new("VALIDATION", "未知的浏览器偏好").with_details(id.to_string()));
        }
    };
    for bin in bins {
        let mut command = Command::new(bin);
        crate::process_cmd::configure_background_command(&mut command);
        if command.arg(url).spawn().is_ok() {
            return Ok(());
        }
    }
    Err(AppError::new("INTERNAL", "未找到可用浏览器"))
}

#[cfg(target_os = "macos")]
fn dirs_home() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}
