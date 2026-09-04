//! 连接配置落盘 + PostgreSQL 连接/建库/迁移。

use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use sqlx::{PgPool, Row};

use crate::error::AppError;
use crate::models::setup::DbConfig;

/// 与 `git-accounts.json`、`ai-secrets.json` 同目录同套路的轻量配置文件。
const CONFIG_FILE: &str = "db-config.json";
const CONNECT_TIMEOUT: Duration = Duration::from_secs(8);
const MAX_CONNECTIONS: u32 = 5;

fn config_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(CONFIG_FILE)
}

pub fn load_config(app_data_dir: &Path) -> Option<DbConfig> {
    let text = fs::read_to_string(config_path(app_data_dir)).ok()?;
    serde_json::from_str(&text).ok()
}

pub fn save_config(app_data_dir: &Path, config: &DbConfig) -> Result<(), AppError> {
    let path = config_path(app_data_dir);
    let text = serde_json::to_string_pretty(config).map_err(|error| {
        AppError::new("INTERNAL", "无法序列化数据库配置").with_details(error.to_string())
    })?;
    fs::write(&path, text)
        .map_err(|error| AppError::new("IO", "无法写入数据库配置").with_details(error.to_string()))
}

/// 建池。口令错误、库不存在等都在这里变成可读的错误信息。
pub async fn connect(url: &str) -> Result<PgPool, AppError> {
    let options: PgConnectOptions = url
        .parse()
        .map_err(|error: sqlx::Error| AppError::new("VALIDATION", "数据库连接参数无效")
            .with_details(error.to_string()))?;

    PgPoolOptions::new()
        .max_connections(MAX_CONNECTIONS)
        .acquire_timeout(CONNECT_TIMEOUT)
        .connect_with(options)
        .await
        .map_err(|error| {
            AppError::new("DB_CONNECT_FAILED", "无法连接 PostgreSQL")
                .with_details(error.to_string())
        })
}

pub async fn server_version(pool: &PgPool) -> Result<String, AppError> {
    Ok(sqlx::query("SHOW server_version")
        .fetch_one(pool)
        .await?
        .try_get::<String, _>(0)?)
}

pub async fn database_exists(pool: &PgPool, database: &str) -> Result<bool, AppError> {
    let count = sqlx::query_scalar::<_, i64>("SELECT COUNT(1) FROM pg_database WHERE datname = $1")
        .bind(database)
        .fetch_one(pool)
        .await?;
    Ok(count > 0)
}

/// `CREATE DATABASE` 不接受占位参数，库名必须由调用方先校验为安全标识符。
pub async fn create_database(pool: &PgPool, database: &str) -> Result<(), AppError> {
    sqlx::query(&format!("CREATE DATABASE \"{database}\""))
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn run_migrations(pool: &PgPool) -> Result<(), AppError> {
    sqlx::migrate!("./migrations")
        .run(pool)
        .await
        .map_err(|error| {
            AppError::new("DB_MIGRATE_FAILED", "数据库初始化失败").with_details(error.to_string())
        })
}

/// 迁移是否已跑过：以 `projects` 表存在为判据。
pub async fn schema_ready(pool: &PgPool) -> Result<bool, AppError> {
    Ok(sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (
           SELECT 1 FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name = 'projects'
         )",
    )
    .fetch_one(pool)
    .await?)
}
