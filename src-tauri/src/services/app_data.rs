//! 应用数据业务规则：分模块清理、目录统计、备份入口下线。

use std::path::Path;

use sqlx::PgPool;

use crate::error::AppError;
use crate::models::app_data::{AppDataPaths, AppDataUsage};
use crate::models::chat::{CHAT_SCOPE_AGENT, CHAT_SCOPE_AGENT_GLOBAL};
use crate::repositories::app_data::{
    remove_legacy_identity_files, reset_store_file, STORE_AGENT_IDENTITY, STORE_AGENT_PLUGINS,
    STORE_AI, STORE_GIT, STORE_SSH_KEYS,
};
use crate::repositories::{self};

/// 存储改为外部 PostgreSQL 后，`databasePath` 回显连接目标而非本地文件。
pub fn resolve_paths(app_data_dir: &Path) -> AppDataPaths {
    let database_path = repositories::setup::load_config(app_data_dir)
        .map(|config| {
            format!(
                "postgres://{}:{}/{}",
                config.host, config.port, config.database
            )
        })
        .unwrap_or_else(|| "尚未配置".to_string());

    AppDataPaths {
        app_data_dir: app_data_dir.to_string_lossy().into_owned(),
        database_path,
    }
}

pub fn measure_usage(app_data_dir: &Path) -> Result<AppDataUsage, AppError> {
    let total_bytes = repositories::app_data::dir_total_bytes(app_data_dir).map_err(|error| {
        AppError::new("INTERNAL", "无法统计应用数据目录体积").with_details(error.to_string())
    })?;
    Ok(AppDataUsage {
        path: app_data_dir.to_string_lossy().into_owned(),
        total_bytes,
    })
}

pub fn reveal_target(app_data_dir: &Path, target: &str) -> Result<(), AppError> {
    match target {
        // 数据库已不在本地目录，两个目标都定位到应用数据目录
        "dir" | "database" => repositories::app_data::reveal_path(app_data_dir),
        _ => Err(AppError::new("VALIDATION", "未知的 reveal 目标")),
    }
}

pub async fn clear_module(
    pool: &PgPool,
    app_data_dir: &Path,
    module: &str,
) -> Result<(), AppError> {
    match module {
        "agent_chats" => repositories::chat::delete_by_scope(pool, CHAT_SCOPE_AGENT).await,
        "multi_agent_chats" => {
            repositories::chat::delete_by_scope(pool, CHAT_SCOPE_AGENT_GLOBAL).await
        }
        "ai_secrets" => reset_store_file(app_data_dir, STORE_AI),
        "git_accounts" => reset_store_file(app_data_dir, STORE_GIT),
        "multi_agent_identity" => {
            reset_store_file(app_data_dir, STORE_AGENT_IDENTITY)?;
            remove_legacy_identity_files(app_data_dir);
            Ok(())
        }
        "ui_prefs" | "open_tabs" => Ok(()),
        "all_app_data" => reset_stores_and_chats(pool, app_data_dir).await,
        // 出厂重置：会话/密钥/账号/偏好对应 Store + 已登记仓库与工作区（不含 ~/.ssh 系统密钥）
        "factory_reset" => {
            reset_stores_and_chats(pool, app_data_dir).await?;
            clear_project_catalog(pool).await
        }
        _ => Err(AppError::new("VALIDATION", "未知的清理模块")),
    }
}

async fn reset_stores_and_chats(pool: &PgPool, app_data_dir: &Path) -> Result<(), AppError> {
    // 兜底清空全部会话（含迁移前残留的未知 scope）
    repositories::chat::delete_all(pool).await?;
    for store in [
        STORE_AI,
        STORE_GIT,
        STORE_AGENT_IDENTITY,
        STORE_SSH_KEYS,
        STORE_AGENT_PLUGINS,
    ] {
        reset_store_file(app_data_dir, store)?;
    }
    remove_legacy_identity_files(app_data_dir);
    Ok(())
}

async fn clear_project_catalog(pool: &PgPool) -> Result<(), AppError> {
    repositories::recent::delete_all(pool).await?;
    repositories::project::delete_all(pool).await?;
    repositories::workspace::delete_all(pool).await?;
    Ok(())
}

/// 备份/导入依赖 SQLite 的 `VACUUM INTO`，切换到 PostgreSQL 后本阶段下线。
pub fn backup_unsupported() -> AppError {
    AppError::new(
        "NOT_SUPPORTED",
        "切换到 PostgreSQL 后备份与导入暂不可用，请使用 pg_dump / pg_restore",
    )
}
