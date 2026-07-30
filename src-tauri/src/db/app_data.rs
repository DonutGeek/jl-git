use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sqlx::SqlitePool;
use uuid::Uuid;
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};

use crate::error::AppError;

use super::{to_db_error, CHAT_SCOPE_AGENT, CHAT_SCOPE_AGENT_GLOBAL};

pub const DB_FILE_NAME: &str = "jlgit.db";
pub const DB_PENDING_NAME: &str = "jlgit.db.pending";
const DB_IMPORT_BACKUP_NAME: &str = "jlgit.db.import-backup";
pub const BACKUP_FORMAT: &str = "jlgit-backup";
pub const BACKUP_FORMAT_VERSION: u32 = 1;
pub const APP_ID: &str = "com.jingling.jlgit";

const STORE_AI: &str = "ai-secrets.json";
const STORE_GIT: &str = "git-accounts.json";
/// 简历插件联系信息 Store（多仓鲸灵）
const STORE_AGENT_IDENTITY: &str = "agent-identity.json";
/// 应用内 SSH 密钥登记（不含 ~/.ssh 系统密钥文件本身）
const STORE_SSH_KEYS: &str = "ssh-keys.json";
/// 插件/技能卸载偏好
const STORE_AGENT_PLUGINS: &str = "agent-plugins.json";
/// 旧版文件名，按顺序保留兼容（备份/恢复/清理时一并处理）
const STORE_AGENT_IDENTITY_LEGACY: [&str; 2] = ["jinglv.json", "resume-helper.json"];
const MAX_BACKUP_MANIFEST_BYTES: u64 = 64 * 1024;
const MAX_BACKUP_DATABASE_BYTES: u64 = 512 * 1024 * 1024;
const MAX_BACKUP_JSON_BYTES: u64 = 16 * 1024 * 1024;
const MAX_BACKUP_EXTRACTED_BYTES: u64 = 576 * 1024 * 1024;
const SQLITE_HEADER: &[u8; 16] = b"SQLite format 3\0";

struct TemporaryDirectory(PathBuf);

impl TemporaryDirectory {
    fn create(app_data_dir: &Path, prefix: &str) -> Result<Self, AppError> {
        let path = app_data_dir.join(format!("{prefix}-{}", Uuid::new_v4()));
        fs::create_dir(&path).map_err(|error| {
            AppError::new("IO", "无法创建临时目录").with_details(error.to_string())
        })?;
        Ok(Self(path))
    }

    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for TemporaryDirectory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppDataPaths {
    pub app_data_dir: String,
    pub database_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppDataUsage {
    pub path: String,
    pub total_bytes: u64,
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

pub struct PendingDatabaseSwap {
    target: PathBuf,
    backup: PathBuf,
    had_original: bool,
}

impl PendingDatabaseSwap {
    /// 新库无法连接或迁移时恢复导入前的数据库。
    pub fn rollback(self) -> Result<(), AppError> {
        if self.target.exists() {
            fs::remove_file(&self.target).map_err(|error| {
                AppError::new("IO", "无法移除无效的导入数据库").with_details(error.to_string())
            })?;
        }
        if self.had_original {
            fs::rename(&self.backup, &self.target).map_err(|error| {
                AppError::new("IO", "无法恢复导入前的数据库").with_details(error.to_string())
            })?;
        }
        Ok(())
    }

    /// 新库已成功连接并完成迁移后清理旧库备份。
    pub fn complete(self) -> Result<(), AppError> {
        if !self.had_original || !self.backup.exists() {
            return Ok(());
        }
        fs::remove_file(&self.backup).map_err(|error| {
            AppError::new("IO", "无法清理旧数据库备份").with_details(error.to_string())
        })
    }
}

/// 若存在 pending DB，则在建立连接前替换正式库文件。
/// 返回 guard，由启动流程在连接/迁移成功后确认，否则回滚旧库。
pub fn apply_pending_database(
    app_data_dir: &Path,
) -> Result<Option<PendingDatabaseSwap>, AppError> {
    let pending = app_data_dir.join(DB_PENDING_NAME);
    let target = app_data_dir.join(DB_FILE_NAME);
    let backup = app_data_dir.join(DB_IMPORT_BACKUP_NAME);

    if !pending.is_file() {
        if backup.is_file() && target.is_file() {
            // 上次可能在替换后、连接确认前闪退；重新验证当前库后再清理备份。
            return Ok(Some(PendingDatabaseSwap {
                target,
                backup,
                had_original: true,
            }));
        }
        if backup.is_file() && !target.exists() {
            // 上次在旧库移走后、pending 就位前闪退，直接恢复旧库。
            fs::rename(&backup, &target).map_err(|error| {
                AppError::new("IO", "无法恢复中断的数据库导入").with_details(error.to_string())
            })?;
        }
        return Ok(None);
    }

    if backup.exists() {
        return Err(AppError::new(
            "IO",
            "检测到未完成的数据库导入恢复状态，请重新启动应用",
        ));
    }

    let had_original = target.is_file();
    if had_original {
        fs::rename(&target, &backup).map_err(|error| {
            AppError::new("IO", "无法备份旧数据库").with_details(error.to_string())
        })?;
    }
    if let Err(error) = fs::rename(&pending, &target) {
        if had_original {
            let _ = fs::rename(&backup, &target);
        }
        return Err(AppError::new("IO", "无法应用导入的数据库").with_details(error.to_string()));
    }

    Ok(Some(PendingDatabaseSwap {
        target,
        backup,
        had_original,
    }))
}

pub fn resolve_paths(app_data_dir: &Path) -> AppDataPaths {
    AppDataPaths {
        app_data_dir: app_data_dir.to_string_lossy().into_owned(),
        database_path: app_data_dir
            .join(DB_FILE_NAME)
            .to_string_lossy()
            .into_owned(),
    }
}

/// 递归统计应用数据目录占用（设置「性能」低频刷新）
pub fn measure_usage(app_data_dir: &Path) -> Result<AppDataUsage, AppError> {
    let total_bytes = dir_total_bytes(app_data_dir).map_err(|error| {
        AppError::new("INTERNAL", "无法统计应用数据目录体积").with_details(error.to_string())
    })?;
    Ok(AppDataUsage {
        path: app_data_dir.to_string_lossy().into_owned(),
        total_bytes,
    })
}

fn dir_total_bytes(path: &Path) -> std::io::Result<u64> {
    let meta = fs::symlink_metadata(path)?;
    if meta.file_type().is_symlink() {
        return Ok(0);
    }
    if meta.is_file() {
        return Ok(meta.len());
    }
    if !meta.is_dir() {
        return Ok(0);
    }
    let mut total = 0u64;
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        total = total.saturating_add(dir_total_bytes(&entry.path())?);
    }
    Ok(total)
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
        "all_app_data" => reset_app_stores_and_chats(pool, app_data_dir).await,
        // 出厂重置：会话/密钥/账号/偏好对应 Store + 已登记仓库与工作区（不含 ~/.ssh 系统密钥）
        "factory_reset" => {
            reset_app_stores_and_chats(pool, app_data_dir).await?;
            clear_project_catalog(pool).await?;
            Ok(())
        }
        _ => Err(AppError::new("VALIDATION", "未知的清理模块")),
    }
}

async fn reset_app_stores_and_chats(
    pool: &SqlitePool,
    app_data_dir: &Path,
) -> Result<(), AppError> {
    clear_chats(pool, CHAT_SCOPE_AGENT).await?;
    clear_chats(pool, CHAT_SCOPE_AGENT_GLOBAL).await?;
    // 兼容：旧 scope 一并清掉（迁移前残留）
    let _ = clear_chats(pool, "jinglv").await;
    let _ = clear_chats(pool, "resume_helper").await;
    // 兜底：清空全部会话（含未知 scope）
    sqlx::query("DELETE FROM chat_conversations")
        .execute(pool)
        .await
        .map_err(to_db_error)?;
    reset_store_file(app_data_dir, STORE_AI)?;
    reset_store_file(app_data_dir, STORE_GIT)?;
    reset_store_file(app_data_dir, STORE_AGENT_IDENTITY)?;
    reset_store_file(app_data_dir, STORE_SSH_KEYS)?;
    reset_store_file(app_data_dir, STORE_AGENT_PLUGINS)?;
    for legacy in STORE_AGENT_IDENTITY_LEGACY {
        let _ = fs::remove_file(app_data_dir.join(legacy));
    }
    Ok(())
}

async fn clear_project_catalog(pool: &SqlitePool) -> Result<(), AppError> {
    sqlx::query("DELETE FROM recent_projects")
        .execute(pool)
        .await
        .map_err(to_db_error)?;
    sqlx::query("DELETE FROM projects")
        .execute(pool)
        .await
        .map_err(to_db_error)?;
    sqlx::query("DELETE FROM workspaces")
        .execute(pool)
        .await
        .map_err(to_db_error)?;
    Ok(())
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
    // 删除文件，避免前端 LazyStore 内存态与磁盘「空对象」不一致后又被 save 写回
    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => {
            Err(AppError::new("IO", format!("无法重置 {file_name}"))
                .with_details(error.to_string()))
        }
    }
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

    let temp_dir = TemporaryDirectory::create(app_data_dir, ".backup-export-tmp")?;

    let temp_db = temp_dir.path().join(DB_FILE_NAME);
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

    let dest_name = dest
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("jlgit-backup.zip");
    let temp_dest = dest.with_file_name(format!(".{dest_name}.jlgit-tmp-{}", Uuid::new_v4()));
    let write_result = (|| -> Result<(), AppError> {
        let file = File::create(&temp_dest).map_err(|error| {
            AppError::new("IO", "无法创建临时备份文件").with_details(error.to_string())
        })?;
        let mut zip = ZipWriter::new(file);
        let options =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

        zip.start_file("manifest.json", options).map_err(zip_err)?;
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
        let file = zip.finish().map_err(zip_err)?;
        file.sync_all().map_err(io_err)
    })();
    if let Err(error) = write_result {
        let _ = fs::remove_file(&temp_dest);
        return Err(error);
    }
    replace_export_destination(&temp_dest, &dest)?;

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
        let mut entry = archive
            .by_name("manifest.json")
            .map_err(|_| AppError::new("VALIDATION", "备份缺少 manifest.json"))?;
        ensure_backup_entry_size("manifest.json", entry.size(), 0)?;
        let mut buf = String::new();
        entry
            .by_ref()
            .take(MAX_BACKUP_MANIFEST_BYTES + 1)
            .read_to_string(&mut buf)
            .map_err(io_err)?;
        if buf.len() as u64 > MAX_BACKUP_MANIFEST_BYTES {
            return Err(AppError::new("VALIDATION", "备份清单体积超出限制"));
        }
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

    let staging = TemporaryDirectory::create(app_data_dir, ".backup-import-tmp")?;
    fs::create_dir(staging.path().join("stores")).map_err(io_err)?;
    let mut extracted_bytes = 0_u64;
    let mut extracted_names = HashSet::new();

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|error| {
            AppError::new("IO", "读取备份条目失败").with_details(error.to_string())
        })?;
        if entry.is_dir() {
            continue;
        }
        let enclosed = entry
            .enclosed_name()
            .ok_or_else(|| AppError::new("VALIDATION", "备份包含越界路径"))?;
        let name = enclosed.to_string_lossy().replace('\\', "/");
        let Some(limit) = backup_entry_limit(&name) else {
            continue;
        };
        if !extracted_names.insert(name.clone()) {
            return Err(AppError::new("VALIDATION", "备份包含重复条目"));
        }
        ensure_backup_entry_size(&name, entry.size(), extracted_bytes)?;
        extracted_bytes = extracted_bytes.saturating_add(entry.size());

        let out_path = staging.path().join(&enclosed);
        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent).map_err(io_err)?;
        }
        let mut out = File::create(&out_path).map_err(io_err)?;
        let copied =
            std::io::copy(&mut entry.by_ref().take(limit + 1), &mut out).map_err(io_err)?;
        if copied > limit {
            return Err(AppError::new("VALIDATION", "备份条目体积超出限制"));
        }
    }

    let imported_db = staging.path().join(DB_FILE_NAME);
    if !imported_db.is_file() {
        return Err(AppError::new("VALIDATION", "备份缺少数据库文件"));
    }
    validate_sqlite_file(&imported_db)?;

    let local_storage = {
        let path = staging.path().join("localStorage.json");
        if path.is_file() {
            let text = fs::read_to_string(&path).map_err(io_err)?;
            serde_json::from_str::<Map<String, Value>>(&text).map_err(|error| {
                AppError::new("VALIDATION", "localStorage.json 无效")
                    .with_details(error.to_string())
            })?
        } else {
            Map::new()
        }
    };

    for name in [STORE_AI, STORE_GIT, STORE_AGENT_IDENTITY] {
        let src = staging.path().join("stores").join(name);
        let dest = app_data_dir.join(name);
        if src.is_file() {
            fs::copy(&src, &dest).map_err(io_err)?;
        }
    }

    let pending = app_data_dir.join(DB_PENDING_NAME);
    fs::copy(&imported_db, &pending).map_err(io_err)?;

    Ok(AppDataImportResult {
        ok: true,
        local_storage,
        requires_restart: true,
    })
}

fn backup_entry_limit(name: &str) -> Option<u64> {
    if name == "manifest.json" {
        return Some(MAX_BACKUP_MANIFEST_BYTES);
    }
    if name == DB_FILE_NAME {
        return Some(MAX_BACKUP_DATABASE_BYTES);
    }
    if name == "localStorage.json"
        || [STORE_AI, STORE_GIT, STORE_AGENT_IDENTITY]
            .iter()
            .any(|store| name == format!("stores/{store}"))
    {
        return Some(MAX_BACKUP_JSON_BYTES);
    }
    None
}

fn ensure_backup_entry_size(name: &str, size: u64, already_extracted: u64) -> Result<(), AppError> {
    let limit =
        backup_entry_limit(name).ok_or_else(|| AppError::new("VALIDATION", "备份包含未知条目"))?;
    if size > limit || already_extracted.saturating_add(size) > MAX_BACKUP_EXTRACTED_BYTES {
        return Err(AppError::new("VALIDATION", "备份条目体积超出限制"));
    }
    Ok(())
}

fn validate_sqlite_file(path: &Path) -> Result<(), AppError> {
    let mut file = File::open(path).map_err(io_err)?;
    let mut header = [0_u8; 16];
    file.read_exact(&mut header)
        .map_err(|_| AppError::new("VALIDATION", "备份数据库无效"))?;
    if &header != SQLITE_HEADER {
        return Err(AppError::new("VALIDATION", "备份数据库格式不正确"));
    }
    Ok(())
}

fn replace_export_destination(temp: &Path, dest: &Path) -> Result<(), AppError> {
    if !dest.exists() {
        return fs::rename(temp, dest).map_err(io_err);
    }
    if !dest.is_file() {
        let _ = fs::remove_file(temp);
        return Err(AppError::new("VALIDATION", "备份目标不是文件"));
    }

    let dest_name = dest
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("jlgit-backup.zip");
    let previous = dest.with_file_name(format!(".{dest_name}.jlgit-old-{}", Uuid::new_v4()));
    fs::rename(dest, &previous).map_err(io_err)?;
    if let Err(error) = fs::rename(temp, dest) {
        if let Err(restore_error) = fs::rename(&previous, dest) {
            let _ = fs::remove_file(temp);
            return Err(AppError::new(
                "IO_RECOVERY_FAILED",
                format!(
                    "无法恢复原备份；原文件仍保留在 {}",
                    previous.to_string_lossy()
                ),
            )
            .with_details(format!("{error}; {restore_error}")));
        }
        let _ = fs::remove_file(temp);
        return Err(AppError::new("IO", "无法替换备份文件").with_details(error.to_string()));
    }
    let _ = fs::remove_file(previous);
    Ok(())
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

#[cfg(test)]
mod tests {
    use super::{
        apply_pending_database, backup_entry_limit, import_backup, replace_export_destination,
        DB_FILE_NAME, DB_IMPORT_BACKUP_NAME, DB_PENDING_NAME,
    };
    use std::fs::{self, File};
    use std::io::Write;
    use std::path::Path;
    use zip::write::SimpleFileOptions;
    use zip::ZipWriter;

    const MANIFEST: &[u8] = br#"{
      "format": "jlgit-backup",
      "formatVersion": 1,
      "appId": "com.jingling.jlgit",
      "appName": "JLGit",
      "createdAt": "2026-07-29T00:00:00Z"
    }"#;

    fn make_temp_dir() -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!("jlgit-backup-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&path).unwrap();
        path
    }

    fn write_backup(path: &Path, entries: &[(&str, &[u8])]) {
        let file = File::create(path).unwrap();
        let mut archive = ZipWriter::new(file);
        let options = SimpleFileOptions::default();
        for (name, bytes) in entries {
            archive.start_file(*name, options).unwrap();
            archive.write_all(bytes).unwrap();
        }
        archive.finish().unwrap();
    }

    #[test]
    fn backup_whitelist_rejects_store_path_traversal() {
        assert!(backup_entry_limit("stores/ai-secrets.json").is_some());
        assert!(backup_entry_limit("stores/../../outside.json").is_none());
        assert!(backup_entry_limit("../jlgit.db").is_none());
    }

    #[test]
    fn import_rejects_invalid_sqlite_database() {
        let dir = make_temp_dir();
        let backup = dir.join("invalid.zip");
        write_backup(
            &backup,
            &[("manifest.json", MANIFEST), (DB_FILE_NAME, b"not sqlite")],
        );

        assert!(import_backup(&dir, backup.to_string_lossy().as_ref()).is_err());
        assert!(!dir.join(DB_PENDING_NAME).exists());

        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn import_rejects_archive_path_traversal() {
        let dir = make_temp_dir();
        let backup = dir.join("traversal.zip");
        write_backup(
            &backup,
            &[
                ("manifest.json", MANIFEST),
                ("stores/../../outside.json", b"escaped"),
            ],
        );

        let error = import_backup(&dir, backup.to_string_lossy().as_ref()).unwrap_err();
        assert_eq!(error.message, "备份包含越界路径");
        assert!(!dir.parent().unwrap().join("outside.json").exists());

        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn pending_database_swap_can_restore_original_database() {
        let dir = make_temp_dir();
        fs::write(dir.join(DB_FILE_NAME), b"original database").unwrap();
        fs::write(dir.join(DB_PENDING_NAME), b"imported database").unwrap();

        let swap = apply_pending_database(&dir).unwrap().unwrap();
        assert_eq!(
            fs::read(dir.join(DB_FILE_NAME)).unwrap(),
            b"imported database"
        );
        assert!(dir.join(DB_IMPORT_BACKUP_NAME).is_file());

        swap.rollback().unwrap();
        assert_eq!(
            fs::read(dir.join(DB_FILE_NAME)).unwrap(),
            b"original database"
        );
        assert!(!dir.join(DB_IMPORT_BACKUP_NAME).exists());

        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn export_replacement_keeps_complete_new_file() {
        let dir = make_temp_dir();
        let target = dir.join("backup.zip");
        let temporary = dir.join(".backup.tmp");
        fs::write(&target, b"old complete backup").unwrap();
        fs::write(&temporary, b"new complete backup").unwrap();

        replace_export_destination(&temporary, &target).unwrap();

        assert_eq!(fs::read(target).unwrap(), b"new complete backup");
        assert!(!temporary.exists());
        fs::remove_dir_all(dir).unwrap();
    }
}
