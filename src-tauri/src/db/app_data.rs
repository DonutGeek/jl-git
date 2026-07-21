use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sqlx::SqlitePool;
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};

use crate::error::AppError;

use super::{to_db_error, CHAT_SCOPE_AGENT, CHAT_SCOPE_AGENT_GLOBAL};

pub const DB_FILE_NAME: &str = "jlgit.db";
pub const DB_PENDING_NAME: &str = "jlgit.db.pending";
pub const BACKUP_FORMAT: &str = "jlgit-backup";
pub const BACKUP_FORMAT_VERSION: u32 = 1;
pub const APP_ID: &str = "com.jingling.jlgit";

const STORE_AI: &str = "ai-secrets.json";
const STORE_GIT: &str = "git-accounts.json";
/// 简历插件联系信息 Store（多仓鲸灵）
const STORE_AGENT_IDENTITY: &str = "agent-identity.json";
/// 旧版文件名，按顺序保留兼容（备份/恢复/清理时一并处理）
const STORE_AGENT_IDENTITY_LEGACY: [&str; 2] = ["jinglv.json", "resume-helper.json"];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppDataPaths {
    pub app_data_dir: String,
    pub database_path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppDataExportInput {
    pub dest_path: String,
    #[serde(default)]
    pub local_storage: Map<String, Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppDataImportResult {
    pub ok: bool,
    pub local_storage: Map<String, Value>,
    pub requires_restart: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupManifest {
    format: String,
    format_version: u32,
    app_id: String,
    app_name: String,
    created_at: String,
}

/// 若存在 pending DB，则在建立连接前替换正式库文件。
pub fn apply_pending_database(app_data_dir: &Path) -> Result<(), AppError> {
    let pending = app_data_dir.join(DB_PENDING_NAME);
    if !pending.is_file() {
        return Ok(());
    }
    let target = app_data_dir.join(DB_FILE_NAME);
    let backup = app_data_dir.join(format!("{DB_FILE_NAME}.bak"));
    if target.is_file() {
        let _ = fs::remove_file(&backup);
        fs::rename(&target, &backup).map_err(|error| {
            AppError::new("IO", "无法备份旧数据库").with_details(error.to_string())
        })?;
    }
    fs::rename(&pending, &target).map_err(|error| {
        AppError::new("IO", "无法应用导入的数据库").with_details(error.to_string())
    })?;
    let _ = fs::remove_file(&backup);
    Ok(())
}

pub fn resolve_paths(app_data_dir: &Path) -> AppDataPaths {
    AppDataPaths {
        app_data_dir: app_data_dir.to_string_lossy().into_owned(),
        database_path: app_data_dir.join(DB_FILE_NAME).to_string_lossy().into_owned(),
    }
}

pub fn reveal_target(app_data_dir: &Path, target: &str) -> Result<(), AppError> {
    match target {
        "dir" => reveal_path(app_data_dir),
        "database" => {
            let db = app_data_dir.join(DB_FILE_NAME);
            if db.is_file() {
                reveal_path(&db)
            } else {
                reveal_path(app_data_dir)
            }
        }
        _ => Err(AppError::new("VALIDATION", "未知的 reveal 目标")),
    }
}

fn reveal_path(path: &Path) -> Result<(), AppError> {
    let path_str = path.to_string_lossy().into_owned();

    #[cfg(target_os = "macos")]
    {
        let mut cmd = Command::new("open");
        if path.is_file() {
            cmd.arg("-R");
        }
        let status = cmd.arg(&path_str).status().map_err(|error| {
            AppError::new("INTERNAL", "无法打开访达").with_details(error.to_string())
        })?;
        if !status.success() {
            return Err(AppError::new("INTERNAL", "打开访达失败"));
        }
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        if path.is_file() {
            Command::new("explorer")
                .arg(format!("/select,{}", path_str))
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
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let open_target = if path.is_file() {
            path.parent().unwrap_or(path)
        } else {
            path
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
        return Ok(());
    }

    #[allow(unreachable_code)]
    Err(AppError::new("INTERNAL", "当前平台不支持打开文件管理器"))
}

pub async fn clear_module(
    pool: &SqlitePool,
    app_data_dir: &Path,
    module: &str,
) -> Result<(), AppError> {
    match module {
        "agent_chats" => clear_chats(pool, CHAT_SCOPE_AGENT).await,
        "multi_agent_chats" => clear_chats(pool, CHAT_SCOPE_AGENT_GLOBAL).await,
        "ai_secrets" => reset_store_file(app_data_dir, STORE_AI),
        "git_accounts" => reset_store_file(app_data_dir, STORE_GIT),
        "multi_agent_identity" => {
            reset_store_file(app_data_dir, STORE_AGENT_IDENTITY)?;
            for legacy in STORE_AGENT_IDENTITY_LEGACY {
                let _ = fs::remove_file(app_data_dir.join(legacy));
            }
            Ok(())
        }
        "ui_prefs" | "open_tabs" => Ok(()),
        "all_app_data" => {
            clear_chats(pool, CHAT_SCOPE_AGENT).await?;
            clear_chats(pool, CHAT_SCOPE_AGENT_GLOBAL).await?;
            // 兼容：旧 scope 一并清掉（迁移前残留）
            let _ = clear_chats(pool, "jinglv").await;
            let _ = clear_chats(pool, "resume_helper").await;
            reset_store_file(app_data_dir, STORE_AI)?;
            reset_store_file(app_data_dir, STORE_GIT)?;
            reset_store_file(app_data_dir, STORE_AGENT_IDENTITY)?;
            for legacy in STORE_AGENT_IDENTITY_LEGACY {
                let _ = fs::remove_file(app_data_dir.join(legacy));
            }
            Ok(())
        }
        _ => Err(AppError::new("VALIDATION", "未知的清理模块")),
    }
}

async fn clear_chats(pool: &SqlitePool, scope: &str) -> Result<(), AppError> {
    sqlx::query("DELETE FROM chat_conversations WHERE scope = ?1")
        .bind(scope)
        .execute(pool)
        .await
        .map_err(to_db_error)?;
    Ok(())
}

fn reset_store_file(app_data_dir: &Path, file_name: &str) -> Result<(), AppError> {
    let path = app_data_dir.join(file_name);
    fs::write(&path, "{}\n").map_err(|error| {
        AppError::new("IO", format!("无法重置 {file_name}")).with_details(error.to_string())
    })?;
    Ok(())
}

pub async fn export_backup(
    pool: &SqlitePool,
    app_data_dir: &Path,
    input: AppDataExportInput,
) -> Result<(), AppError> {
    let dest = PathBuf::from(input.dest_path.trim());
    if dest.as_os_str().is_empty() {
        return Err(AppError::new("VALIDATION", "导出路径不能为空"));
    }
    if let Some(parent) = dest.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|error| {
                AppError::new("IO", "无法创建导出目录").with_details(error.to_string())
            })?;
        }
    }

    let temp_dir = app_data_dir.join(".backup-export-tmp");
    let _ = fs::remove_dir_all(&temp_dir);
    fs::create_dir_all(&temp_dir).map_err(|error| {
        AppError::new("IO", "无法创建临时目录").with_details(error.to_string())
    })?;

    let temp_db = temp_dir.join(DB_FILE_NAME);
    let temp_db_str = temp_db.to_string_lossy().replace('\'', "''");
    sqlx::query(&format!("VACUUM INTO '{temp_db_str}'"))
        .execute(pool)
        .await
        .map_err(to_db_error)?;

    let manifest = BackupManifest {
        format: BACKUP_FORMAT.to_string(),
        format_version: BACKUP_FORMAT_VERSION,
        app_id: APP_ID.to_string(),
        app_name: "JLGit".to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    let manifest_bytes = serde_json::to_vec_pretty(&manifest).map_err(|error| {
        AppError::new("INTERNAL", "无法序列化备份清单").with_details(error.to_string())
    })?;
    let local_storage_bytes = serde_json::to_vec_pretty(&input.local_storage).map_err(|error| {
        AppError::new("INTERNAL", "无法序列化 localStorage").with_details(error.to_string())
    })?;

    let file = File::create(&dest).map_err(|error| {
        AppError::new("IO", "无法创建备份文件").with_details(error.to_string())
    })?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    zip.start_file("manifest.json", options)
        .map_err(zip_err)?;
    zip.write_all(&manifest_bytes).map_err(io_err)?;

    zip.start_file(DB_FILE_NAME, options).map_err(zip_err)?;
    let mut db_file = File::open(&temp_db).map_err(io_err)?;
    std::io::copy(&mut db_file, &mut zip).map_err(io_err)?;

    for name in [STORE_AI, STORE_GIT, STORE_AGENT_IDENTITY] {
        let store_path = app_data_dir.join(name);
        let bytes = if store_path.is_file() {
            fs::read(&store_path).map_err(io_err)?
        } else if name == STORE_AGENT_IDENTITY {
            // 新文件不存在时按顺序回退旧版简历插件配置文件
            read_first_existing(app_data_dir, &STORE_AGENT_IDENTITY_LEGACY)
                .unwrap_or_else(|| b"{}\n".to_vec())
        } else {
            b"{}\n".to_vec()
        };
        zip.start_file(format!("stores/{name}"), options)
            .map_err(zip_err)?;
        zip.write_all(&bytes).map_err(io_err)?;
    }

    zip.start_file("localStorage.json", options)
        .map_err(zip_err)?;
    zip.write_all(&local_storage_bytes).map_err(io_err)?;
    zip.finish().map_err(zip_err)?;

    let _ = fs::remove_dir_all(&temp_dir);
    Ok(())
}

pub fn import_backup(
    app_data_dir: &Path,
    source_path: &str,
) -> Result<AppDataImportResult, AppError> {
    let source = PathBuf::from(source_path.trim());
    if !source.is_file() {
        return Err(AppError::new("VALIDATION", "备份文件不存在"));
    }

    let file = File::open(&source).map_err(io_err)?;
    let mut archive = ZipArchive::new(file).map_err(|error| {
        AppError::new("VALIDATION", "无法读取备份包").with_details(error.to_string())
    })?;

    let manifest: BackupManifest = {
        let mut entry = archive.by_name("manifest.json").map_err(|_| {
            AppError::new("VALIDATION", "备份缺少 manifest.json")
        })?;
        let mut buf = String::new();
        entry.read_to_string(&mut buf).map_err(io_err)?;
        serde_json::from_str(&buf).map_err(|error| {
            AppError::new("VALIDATION", "manifest 无效").with_details(error.to_string())
        })?
    };

    if manifest.format != BACKUP_FORMAT {
        return Err(AppError::new("VALIDATION", "备份格式不正确"));
    }
    if manifest.format_version != BACKUP_FORMAT_VERSION {
        return Err(AppError::new("VALIDATION", "不支持的备份版本"));
    }

    let staging = app_data_dir.join(".backup-import-tmp");
    let _ = fs::remove_dir_all(&staging);
    fs::create_dir_all(&staging).map_err(io_err)?;
    fs::create_dir_all(staging.join("stores")).map_err(io_err)?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|error| {
            AppError::new("IO", "读取备份条目失败").with_details(error.to_string())
        })?;
        let name = entry.name().to_string();
        if name.ends_with('/') {
            continue;
        }
        // 仅允许清单内约定路径
        let allowed = name == "manifest.json"
            || name == DB_FILE_NAME
            || name == "localStorage.json"
            || name.starts_with("stores/");
        if !allowed {
            continue;
        }
        let out_path = staging.join(&name);
        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent).map_err(io_err)?;
        }
        let mut out = File::create(&out_path).map_err(io_err)?;
        std::io::copy(&mut entry, &mut out).map_err(io_err)?;
    }

    let imported_db = staging.join(DB_FILE_NAME);
    if !imported_db.is_file() {
        let _ = fs::remove_dir_all(&staging);
        return Err(AppError::new("VALIDATION", "备份缺少数据库文件"));
    }

    let local_storage = {
        let path = staging.join("localStorage.json");
        if path.is_file() {
            let text = fs::read_to_string(&path).map_err(io_err)?;
            serde_json::from_str::<Map<String, Value>>(&text).unwrap_or_default()
        } else {
            Map::new()
        }
    };

    for name in [STORE_AI, STORE_GIT, STORE_AGENT_IDENTITY] {
        let src = staging.join("stores").join(name);
        let dest = app_data_dir.join(name);
        if src.is_file() {
            fs::copy(&src, &dest).map_err(io_err)?;
        }
    }

    let pending = app_data_dir.join(DB_PENDING_NAME);
    fs::copy(&imported_db, &pending).map_err(io_err)?;
    let _ = fs::remove_dir_all(&staging);

    Ok(AppDataImportResult {
        ok: true,
        local_storage,
        requires_restart: true,
    })
}

/// 按顺序尝试读取第一个存在的旧版文件内容
fn read_first_existing(app_data_dir: &Path, names: &[&str]) -> Option<Vec<u8>> {
    for name in names {
        let path = app_data_dir.join(name);
        if path.is_file() {
            if let Ok(bytes) = fs::read(&path) {
                return Some(bytes);
            }
        }
    }
    None
}

fn zip_err(error: zip::result::ZipError) -> AppError {
    AppError::new("IO", "压缩包操作失败").with_details(error.to_string())
}

fn io_err(error: impl std::fmt::Display) -> AppError {
    AppError::new("IO", "文件操作失败").with_details(error.to_string())
}
