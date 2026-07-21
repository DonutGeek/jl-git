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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshKeyMaterial {
    pub name: String,
    pub public_key: String,
    pub private_key_path: String,
    pub has_passphrase: bool,
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
    let status = Command::new("ssh-keygen")
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
    if stem.is_empty() {
        stem = "jlgit".to_string();
    }
    format!("jlgit_{stem}")
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
