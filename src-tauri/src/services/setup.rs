//! 首启配置向导业务规则：环境检测、试连、建库跑迁移、落盘装池。

use std::process::Command;
use std::time::Duration;

use crate::error::AppError;
use crate::models::setup::{
    DbConfig, DbConfigView, SetupConnectionInput, SetupDetectResult, SetupInitResult, SetupStatus,
    SetupTestResult,
};
use crate::repositories;
use crate::state::AppState;

const DOWNLOAD_URL: &str = "https://www.postgresql.org/download/";
const PROBE_TIMEOUT: Duration = Duration::from_millis(800);

pub async fn status(state: &AppState) -> Result<SetupStatus, AppError> {
    let config = repositories::setup::load_config(state.app_data_dir());
    Ok(SetupStatus {
        configured: config.is_some(),
        connected: state.has_pool().await,
        schema_ready: state.schema_ready(),
        server_version: current_server_version(state).await,
        config: config.as_ref().map(DbConfigView::from),
    })
}

/// 读版本失败不该让状态查询整体失败，未就绪时直接留空。
async fn current_server_version(state: &AppState) -> Option<String> {
    let pool = state.pool().await.ok()?;
    repositories::setup::server_version(&pool).await.ok()
}

/// 只做本机默认端口可达性与 `psql` 探测，不尝试连接数据库。
/// 顺带把连接表单的默认值一起下发，让 `DbConfig::default()` 成为唯一来源。
pub async fn detect() -> Result<SetupDetectResult, AppError> {
    let defaults = DbConfig::default();
    let port_reachable = probe_port(&defaults.host, defaults.port).await;
    let (psql_path, psql_version) = probe_psql();

    Ok(SetupDetectResult {
        port_reachable,
        host: defaults.host,
        port: defaults.port,
        psql_path,
        psql_version,
        suggested_user: defaults.user,
        suggested_database: defaults.database,
        download_url: DOWNLOAD_URL.to_string(),
    })
}

async fn probe_port(host: &str, port: u16) -> bool {
    let connect = tokio::net::TcpStream::connect((host, port));
    matches!(
        tokio::time::timeout(PROBE_TIMEOUT, connect).await,
        Ok(Ok(_))
    )
}

/// 固定命令 + 无用户输入参数，不存在注入面。
fn probe_psql() -> (Option<String>, Option<String>) {
    let locator = if cfg!(windows) { "where" } else { "which" };
    let path = Command::new(locator)
        .arg("psql")
        .output()
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| {
            String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()
                .map(str::trim)
                .filter(|line| !line.is_empty())
                .map(str::to_string)
        });

    let version = Command::new("psql")
        .arg("--version")
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
        .filter(|text| !text.is_empty());

    (path, version)
}

pub async fn test_connection(input: SetupConnectionInput) -> Result<SetupTestResult, AppError> {
    let config = validate(input)?;
    // 先连维护库：目标库还不存在时也能给出「口令正确、库待创建」的判断
    let pool = repositories::setup::connect(&config.maintenance_url()).await?;
    let server_version = repositories::setup::server_version(&pool).await.ok();
    let database_exists = repositories::setup::database_exists(&pool, &config.database).await?;
    pool.close().await;

    Ok(SetupTestResult {
        ok: true,
        server_version,
        database_exists,
    })
}

pub async fn init(input: SetupConnectionInput) -> Result<SetupInitResult, AppError> {
    let config = validate(input)?;

    let maintenance = repositories::setup::connect(&config.maintenance_url()).await?;
    let exists = repositories::setup::database_exists(&maintenance, &config.database).await?;
    if !exists {
        repositories::setup::create_database(&maintenance, &config.database).await?;
    }
    maintenance.close().await;

    let pool = repositories::setup::connect(&config.connection_url()).await?;
    repositories::setup::run_migrations(&pool).await?;
    let schema_ready = repositories::setup::schema_ready(&pool).await?;
    pool.close().await;

    Ok(SetupInitResult {
        ok: true,
        database_created: !exists,
        schema_ready,
    })
}

/// 落盘配置并把连接池装进 `AppState`，此后业务接口才会放行。
pub async fn save(state: &AppState, input: SetupConnectionInput) -> Result<SetupStatus, AppError> {
    let config = validate(input)?;
    let pool = repositories::setup::connect(&config.connection_url()).await?;
    if !repositories::setup::schema_ready(&pool).await? {
        pool.close().await;
        return Err(AppError::new(
            "VALIDATION",
            "数据库尚未初始化，请先完成初始化步骤",
        ));
    }

    repositories::setup::save_config(state.app_data_dir(), &config)?;
    state.install_pool(pool).await;
    state.set_schema_ready(true);

    status(state).await
}

/// 启动时若已有配置就静默装池；失败只记日志，由向导继续兜住。
pub async fn restore_saved_pool(state: &AppState) {
    let Some(config) = repositories::setup::load_config(state.app_data_dir()) else {
        return;
    };
    match repositories::setup::connect(&config.connection_url()).await {
        Ok(pool) => {
            let mut ready = repositories::setup::schema_ready(&pool).await.unwrap_or(false);
            // 已初始化的库要在这里补跑新增迁移，否则新脚本只对首启向导生效
            if ready {
                if let Err(error) = repositories::setup::run_migrations(&pool).await {
                    log::error!(
                        "[setup] 补跑数据库迁移失败: {} details={:?}",
                        error.message,
                        error.details
                    );
                    // schema 处于未知状态，交回向导的初始化步重跑并展示原因
                    ready = false;
                }
            }
            state.install_pool(pool).await;
            state.set_schema_ready(ready);
            if !ready {
                log::warn!("[setup] 数据库已连接但 schema 未就绪，需重新执行初始化");
            }
        }
        Err(error) => {
            log::warn!("[setup] 已保存的数据库配置无法连接: {}", error.message);
        }
    }
}

fn validate(input: SetupConnectionInput) -> Result<DbConfig, AppError> {
    let config: DbConfig = input.into();
    if config.host.is_empty() {
        return Err(AppError::new("VALIDATION", "主机地址不能为空"));
    }
    if config.port == 0 {
        return Err(AppError::new("VALIDATION", "端口不合法"));
    }
    if config.user.is_empty() {
        return Err(AppError::new("VALIDATION", "用户名不能为空"));
    }
    ensure_safe_identifier(&config.database)?;
    Ok(config)
}

/// 库名会被拼进 `CREATE DATABASE`，只允许安全标识符字符。
fn ensure_safe_identifier(database: &str) -> Result<(), AppError> {
    if database.is_empty() || database.len() > 63 {
        return Err(AppError::new("VALIDATION", "数据库名长度须在 1-63 之间"));
    }
    let valid = database
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || character == '_')
        && !database.starts_with(|character: char| character.is_ascii_digit());
    if !valid {
        return Err(AppError::new(
            "VALIDATION",
            "数据库名只能包含字母、数字与下划线，且不能以数字开头",
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::ensure_safe_identifier;
    use crate::models::setup::DbConfig;

    #[test]
    fn rejects_database_names_that_could_break_create_statement() {
        assert!(ensure_safe_identifier("jlgit").is_ok());
        assert!(ensure_safe_identifier("jl_git_2").is_ok());
        assert!(ensure_safe_identifier("jlgit\"; DROP DATABASE x --").is_err());
        assert!(ensure_safe_identifier("2jlgit").is_err());
        assert!(ensure_safe_identifier("").is_err());
    }

    #[test]
    fn connection_url_percent_encodes_credentials() {
        let config = DbConfig {
            host: "127.0.0.1".into(),
            port: 5432,
            user: "jl@git".into(),
            password: "p@ss:word/1".into(),
            database: "jlgit".into(),
        };
        assert_eq!(
            config.connection_url(),
            "postgres://jl%40git:p%40ss%3Aword%2F1@127.0.0.1:5432/jlgit"
        );
    }
}
