use axum::extract::State;
use axum::Json;
use serde::Serialize;

use crate::models::ApiResponse;
use crate::state::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthInfo {
    pub ok: bool,
    pub version: &'static str,
    /// 数据库池是否已装入
    pub db_ready: bool,
    pub schema_ready: bool,
}

/// `GET /api/health`：前端引导阶段用它确认服务已可用。
pub async fn health(State(state): State<AppState>) -> Json<ApiResponse<HealthInfo>> {
    Json(ApiResponse::success(HealthInfo {
        ok: true,
        version: env!("CARGO_PKG_VERSION"),
        db_ready: state.has_pool().await,
        schema_ready: state.schema_ready(),
    }))
}
