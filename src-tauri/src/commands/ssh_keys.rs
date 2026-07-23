use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri::Manager;

use crate::error::AppError;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshKeyGenerateInput {
    /// 展示用名称（同时用于注释与文件名片段）
    pub name: String,
    /// 可选口令；空字符串表示无密码（不落盘）
    pub passphrase: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshKeyReadPublicInput {
    /// 私钥路径或 `.pub` 路径
    pub path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshKeyChangePassphraseInput {
    /// 私钥绝对路径（须位于 `~/.ssh`）
    pub path: String,
    /// 当前口令；无口令时传空字符串
    pub old_passphrase: String,
    /// 新口令；空字符串表示移除口令
    pub new_passphrase: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshKeyDeleteInput {
    /// 私钥绝对路径（须位于 `~/.ssh`）
    pub path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshKeyMaterial {
    pub name: String,
    pub public_key: String,
    pub private_key_path: String,
    pub has_passphrase: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshKeyChangePassphraseResult {
    pub has_passphrase: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshKeyDeleteResult {
    pub ok: bool,
}

/// 生成 ed25519 密钥对到 `~/.ssh`，仅返回公钥与私钥路径（口令不回传、不落盘）。
#[tauri::command]
pub fn ssh_key_generate(
    app: AppHandle,
    input: SshKeyGenerateInput,
) -> Result<SshKeyMaterial, AppError> {
    let name = input.name.trim();
    if name.is_empty() {
        return Err(AppError::new("VALIDATION", "密钥名称不能为空"));
    }
    if name.chars().count() > 64 {
        return Err(AppError::new("VALIDATION", "密钥名称过长"));
    }

    let ssh_dir = resolve_ssh_dir(&app)?;
    fs::create_dir_all(&ssh_dir).map_err(|error| {
        AppError::new("IO", "无法创建 .ssh 目录").with_details(error.to_string())
    })?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&ssh_dir, fs::Permissions::from_mode(0o700));
    }

    let stem = sanitize_key_stem(name);
    let private_path = unique_private_path(&ssh_dir, &stem)?;
    let public_path = PathBuf::from(format!("{}.pub", private_path.display()));

    // 参数数组调用，禁止 shell；口令仅作 -N 入参，不写日志
    let mut command = Command::new("ssh-keygen");
    crate::process_cmd::configure_background_command(&mut command);
    let status = command
        .args([
            "-t",
            "ed25519",
            "-f",
            private_path.to_str().ok_or_else(|| {
                AppError::new("VALIDATION", "密钥路径无效")
            })?,
            "-N",
            &input.passphrase,
            "-C",
            name,
            "-q",
        ])
        .status()
        .map_err(|error| {
            AppError::new("INTERNAL", "无法执行 ssh-keygen，请确认本机已安装 OpenSSH")
                .with_details(error.to_string())
        })?;

    if !status.success() {
        let _ = fs::remove_file(&private_path);
        let _ = fs::remove_file(&public_path);
        return Err(AppError::new("INTERNAL", "生成 SSH 密钥失败"));
    }

    let public_key = read_public_key_file(&public_path)?;
    Ok(SshKeyMaterial {
        name: name.to_string(),
        public_key,
        private_key_path: private_path.to_string_lossy().to_string(),
        has_passphrase: !input.passphrase.is_empty(),
    })
}

/// 修改私钥口令（`ssh-keygen -p`）；口令不回传、不落盘、不写日志。
#[tauri::command]
pub fn ssh_key_change_passphrase(
    app: AppHandle,
    input: SshKeyChangePassphraseInput,
) -> Result<SshKeyChangePassphraseResult, AppError> {
    let private_path = ensure_private_key_in_ssh_dir(&app, &input.path)?;
    let path_str = private_path.to_str().ok_or_else(|| {
        AppError::new("VALIDATION", "密钥路径无效")
    })?;

    // 参数数组调用，禁止 shell；口令仅作 -P/-N 入参
    let mut command = Command::new("ssh-keygen");
    crate::process_cmd::configure_background_command(&mut command);
    let output = command
        .args([
            "-p",
            "-f",
            path_str,
            "-P",
            &input.old_passphrase,
            "-N",
            &input.new_passphrase,
            "-q",
        ])
        .output()
        .map_err(|error| {
            AppError::new("INTERNAL", "无法执行 ssh-keygen，请确认本机已安装 OpenSSH")
                .with_details(error.to_string())
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_lowercase();
        if stderr.contains("incorrect")
            || stderr.contains("bad passphrase")
            || stderr.contains("wrong passphrase")
            || stderr.contains("load failed")
        {
            return Err(AppError::new("VALIDATION", "当前密码不正确"));
        }
        return Err(AppError::new("INTERNAL", "修改密钥密码失败"));
    }

    Ok(SshKeyChangePassphraseResult {
        has_passphrase: !input.new_passphrase.is_empty(),
    })
}

/// 删除 `~/.ssh` 下的私钥及其旁路 `.pub`（文件已不存在则跳过）。
#[tauri::command]
pub fn ssh_key_delete(
    app: AppHandle,
    input: SshKeyDeleteInput,
) -> Result<SshKeyDeleteResult, AppError> {
    let private_path = resolve_key_path_in_ssh_dir(&app, &input.path, false)?;
    let public_path = PathBuf::from(format!("{}.pub", private_path.display()));
    // 公钥路径同样限制在 ~/.ssh 内
    if public_path.exists() {
        let _ = resolve_key_path_in_ssh_dir(
            &app,
            public_path.to_str().unwrap_or_default(),
            true,
        )?;
    }

    remove_file_if_exists(&private_path)?;
    remove_file_if_exists(&public_path)?;
    Ok(SshKeyDeleteResult { ok: true })
}

/// 读取公钥：支持 `.pub` 或对应私钥旁的 `.pub`。
#[tauri::command]
pub fn ssh_key_read_public(input: SshKeyReadPublicInput) -> Result<SshKeyMaterial, AppError> {
    let raw = input.path.trim();
    if raw.is_empty() {
        return Err(AppError::new("VALIDATION", "路径不能为空"));
    }
    let path = PathBuf::from(raw);
    let public_path = resolve_public_path(&path)?;
    let public_key = read_public_key_file(&public_path)?;
    let private_key_path = if path.extension().and_then(|ext| ext.to_str()) == Some("pub") {
        let as_str = path.to_string_lossy();
        as_str
            .strip_suffix(".pub")
            .unwrap_or(as_str.as_ref())
            .to_string()
    } else {
        path.to_string_lossy().to_string()
    };
    let name = public_path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("ssh-key")
        .to_string();

    Ok(SshKeyMaterial {
        name,
        public_key,
        private_key_path,
        has_passphrase: false,
    })
}

fn resolve_ssh_dir(app: &AppHandle) -> Result<PathBuf, AppError> {
    if let Ok(home) = app.path().home_dir() {
        return Ok(home.join(".ssh"));
    }
    Err(AppError::new("INTERNAL", "无法解析用户主目录"))
}

/// 校验私钥存在且落在 `~/.ssh` 下，防止改写任意路径文件。
fn ensure_private_key_in_ssh_dir(app: &AppHandle, raw: &str) -> Result<PathBuf, AppError> {
    resolve_key_path_in_ssh_dir(app, raw, false)
}

/// 解析并校验路径位于 `~/.ssh`；`allow_pub` 为 false 时拒绝 `.pub`。
/// 文件可不存在（删除场景），但仍禁止 `..` 与目录外路径。
fn resolve_key_path_in_ssh_dir(
    app: &AppHandle,
    raw: &str,
    allow_pub: bool,
) -> Result<PathBuf, AppError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(AppError::new("VALIDATION", "路径不能为空"));
    }
    if trimmed.contains("..") {
        return Err(AppError::new("VALIDATION", "路径非法"));
    }

    let path = PathBuf::from(trimmed);
    let is_pub = path.extension().and_then(|ext| ext.to_str()) == Some("pub");
    if is_pub && !allow_pub {
        return Err(AppError::new("VALIDATION", "请指定私钥文件，而非 .pub"));
    }

    let ssh_dir = resolve_ssh_dir(app)?;
    let ssh_canon = ssh_dir.canonicalize().map_err(|error| {
        AppError::new("INVALID_PATH", "无法解析 .ssh 目录").with_details(error.to_string())
    })?;

    if path.exists() {
        if !path.is_file() {
            return Err(AppError::new("INVALID_PATH", "路径不是文件"));
        }
        let path_canon = path.canonicalize().map_err(|error| {
            AppError::new("INVALID_PATH", "无法规范化密钥路径").with_details(error.to_string())
        })?;
        if !path_canon.starts_with(&ssh_canon) {
            return Err(AppError::new(
                "VALIDATION",
                "仅允许操作 ~/.ssh 目录下的密钥",
            ));
        }
        return Ok(path_canon);
    }

    // 文件已缺失：用绝对路径做前缀校验
    let absolute = if path.is_absolute() {
        path
    } else {
        ssh_dir.join(path)
    };
    if !absolute.starts_with(&ssh_dir) && !absolute.starts_with(&ssh_canon) {
        return Err(AppError::new(
            "VALIDATION",
            "仅允许操作 ~/.ssh 目录下的密钥",
        ));
    }
    Ok(absolute)
}

fn remove_file_if_exists(path: &Path) -> Result<(), AppError> {
    if !path.exists() {
        return Ok(());
    }
    if !path.is_file() {
        return Err(AppError::new("VALIDATION", "拒绝删除非普通文件"));
    }
    fs::remove_file(path).map_err(|error| {
        AppError::new("IO", "删除密钥文件失败").with_details(error.to_string())
    })
}

fn sanitize_key_stem(name: &str) -> String {
    let mut stem: String = name
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '_'
            }
        })
        .collect();
    // 与常见 OpenSSH 命名一致，例如 id_ed25519 → ~/.ssh/id_ed25519
    if stem.is_empty() {
        stem = "id_ed25519".to_string();
    }
    stem
}

fn unique_private_path(ssh_dir: &Path, stem: &str) -> Result<PathBuf, AppError> {
    for index in 0..100 {
        let file_name = if index == 0 {
            stem.to_string()
        } else {
            format!("{stem}_{index}")
        };
        let candidate = ssh_dir.join(&file_name);
        let pub_candidate = ssh_dir.join(format!("{file_name}.pub"));
        if !candidate.exists() && !pub_candidate.exists() {
            return Ok(candidate);
        }
    }
    Err(AppError::new("VALIDATION", "无法分配唯一密钥文件名"))
}

fn resolve_public_path(path: &Path) -> Result<PathBuf, AppError> {
    if !path.exists() {
        return Err(AppError::new("INVALID_PATH", "文件不存在"));
    }
    if path.extension().and_then(|ext| ext.to_str()) == Some("pub") {
        return Ok(path.to_path_buf());
    }
    let pub_path = PathBuf::from(format!("{}.pub", path.display()));
    if pub_path.exists() {
        return Ok(pub_path);
    }
    Err(AppError::new(
        "NOT_FOUND",
        "未找到对应公钥文件（需同目录下的 .pub）",
    ))
}

fn read_public_key_file(path: &Path) -> Result<String, AppError> {
    let content = fs::read_to_string(path).map_err(|error| {
        AppError::new("IO", "无法读取公钥文件").with_details(error.to_string())
    })?;
    let line = content
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty() && !line.starts_with('#'))
        .ok_or_else(|| AppError::new("VALIDATION", "公钥文件为空"))?;
    if !(line.starts_with("ssh-")
        || line.starts_with("ecdsa-")
        || line.starts_with("sk-"))
    {
        return Err(AppError::new("VALIDATION", "不是有效的 SSH 公钥"));
    }
    Ok(line.to_string())
}
