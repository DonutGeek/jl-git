use axum::extract::State;
use axum::Json;

use crate::error::AppError;
use crate::models::setup::{
    SetupConnectionInput, SetupDetectResult, SetupInitResult, SetupStatus, SetupTestResult,
};
use crate::models::ApiResponse;
use crate::server::extract::AppJson;
use crate::services;
use crate::state::AppState;

/// `GET /api/setup/status`
pub async fn status(
    State(state): State<AppState>,
) -> Result<Json<ApiResponse<SetupStatus>>, AppError> {
    let status = services::setup::status(&state).await?;
    Ok(Json(ApiResponse::success(status)))
}

/// `POST /api/setup/detect`
pub async fn detect() -> Result<Json<ApiResponse<SetupDetectResult>>, AppError> {
    let result = services::setup::detect().await?;
    Ok(Json(ApiResponse::success(result)))
}

/// `POST /api/setup/test-connection`
pub async fn test_connection(
    AppJson(input): AppJson<SetupConnectionInput>,
) -> Result<Json<ApiResponse<SetupTestResult>>, AppError> {
    let result = services::setup::test_connection(input).await?;
    Ok(Json(ApiResponse::success(result)))
}

/// `POST /api/setup/init`
pub async fn init(
    AppJson(input): AppJson<SetupConnectionInput>,
) -> Result<Json<ApiResponse<SetupInitResult>>, AppError> {
    let result = services::setup::init(input).await?;
    Ok(Json(ApiResponse::success(result)))
}

/// `POST /api/setup/save`
pub async fn save(
    State(state): State<AppState>,
    AppJson(input): AppJson<SetupConnectionInput>,
) -> Result<Json<ApiResponse<SetupStatus>>, AppError> {
    let status = services::setup::save(&state, input).await?;
    Ok(Json(ApiResponse::success(status)))
}
