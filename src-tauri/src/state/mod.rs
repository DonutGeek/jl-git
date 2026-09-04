//! Axum 与 Command 共享的运行时状态。

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use sqlx::PgPool;
use tokio::sync::RwLock;

use crate::error::AppError;

/// 全局状态：连接池在向导配通前是 `None`。
#[derive(Clone)]
pub struct AppState {
    inner: Arc<Inner>,
}

struct Inner {
    db: RwLock<Option<PgPool>>,
    schema_ready: AtomicBool,
    app_data_dir: PathBuf,
    token: String,
}

impl AppState {
    pub fn new(app_data_dir: PathBuf, token: String) -> Self {
        Self {
            inner: Arc::new(Inner {
                db: RwLock::new(None),
                schema_ready: AtomicBool::new(false),
                app_data_dir,
                token,
            }),
        }
    }

    pub fn app_data_dir(&self) -> &PathBuf {
        &self.inner.app_data_dir
    }

    pub fn token(&self) -> &str {
        &self.inner.token
    }

    pub fn schema_ready(&self) -> bool {
        self.inner.schema_ready.load(Ordering::Relaxed)
    }

    pub fn set_schema_ready(&self, ready: bool) {
        self.inner.schema_ready.store(ready, Ordering::Relaxed);
    }

    /// 装入新池并替换旧池；旧池异步关闭，避免阻塞调用方。
    pub async fn install_pool(&self, pool: PgPool) {
        let previous = self.inner.db.write().await.replace(pool);
        if let Some(previous) = previous {
            tauri::async_runtime::spawn(async move { previous.close().await });
        }
    }

    /// 取池；未配通时返回统一的 `DB_NOT_CONFIGURED`。
    pub async fn pool(&self) -> Result<PgPool, AppError> {
        self.inner
            .db
            .read()
            .await
            .clone()
            .ok_or_else(AppError::db_not_configured)
    }

    /// 仅用于探测是否已建池，不产生错误。
    pub async fn has_pool(&self) -> bool {
        self.inner.db.read().await.is_some()
    }
}

/// Handler 参数写 `Db(pool): Db`，未配通时由 extractor 统一拒绝，业务里不再判空。
/// 各域从 Command 迁到 HTTP 时使用；`setup` 域自建连接，不经过它。
#[allow(dead_code)]
pub struct Db(pub PgPool);

impl FromRequestParts<AppState> for Db {
    type Rejection = AppError;

    async fn from_request_parts(
        _parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        Ok(Db(state.pool().await?))
    }
}
