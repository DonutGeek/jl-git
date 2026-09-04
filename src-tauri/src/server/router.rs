//! `/api` 路由树。新增域时只在这里挂 Router，业务不落在本文件。

use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Json, Router};
use tower_http::trace::TraceLayer;

use crate::error::AppError;
use crate::handlers;
use crate::models::ApiResponse;
use crate::server::middleware;
use crate::state::AppState;

pub fn build(state: AppState) -> Router {
    let api = Router::new()
        .route("/health", get(handlers::health::health))
        .nest("/setup", setup_routes())
        .fallback(not_found);

    Router::new()
        .nest("/api", api)
        .fallback(not_found)
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            middleware::require_token,
        ))
        .layer(middleware::cors_layer())
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

fn setup_routes() -> Router<AppState> {
    Router::new()
        .route("/status", get(handlers::setup::status))
        .route("/detect", post(handlers::setup::detect))
        .route("/test-connection", post(handlers::setup::test_connection))
        .route("/init", post(handlers::setup::init))
        .route("/save", post(handlers::setup::save))
}

/// 未匹配路由也返回统一信封，前端不需要为 404 写特例。
async fn not_found() -> (StatusCode, Json<ApiResponse<()>>) {
    let error = AppError::new("NOT_FOUND", "接口不存在");
    (
        StatusCode::NOT_FOUND,
        Json(ApiResponse::fail(StatusCode::NOT_FOUND, error)),
    )
}
