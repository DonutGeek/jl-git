use axum::extract::rejection::{JsonRejection, PathRejection, QueryRejection};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Serialize;
use thiserror::Error;

use crate::models::ApiResponse;

/// 领域错误：`code` 是稳定的语义码，前端按它分支（见 `src/types/error.ts`）。
#[derive(Debug, Error, Serialize)]
#[error("{message}")]
pub struct AppError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
}

impl AppError {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
            details: None,
        }
    }

    pub fn with_details(mut self, details: impl Into<String>) -> Self {
        self.details = Some(details.into());
        self
    }

    /// 本机找不到或无法启动 git
    pub fn git_not_found(details: impl Into<String>) -> Self {
        Self::new(
            "GIT_NOT_FOUND",
            "未检测到本机 Git，请先安装并确保已加入系统 PATH",
        )
        .with_details(details)
    }

    /// 向导尚未配通 PostgreSQL；业务接口一律以此拒绝
    pub fn db_not_configured() -> Self {
        Self::new("DB_NOT_CONFIGURED", "尚未完成数据库配置，请先完成初始化向导")
    }

    /// 语义码 → HTTP 状态码。新增码时在此登记，否则默认 500。
    pub fn status(&self) -> StatusCode {
        match self.code.as_str() {
            // 连接失败源于用户填错参数，不是服务端故障，别落到 500
            "VALIDATION" | "INVALID_PATH" | "NOT_A_REPO" | "DB_CONNECT_FAILED" => {
                StatusCode::BAD_REQUEST
            }
            "UNAUTHORIZED" => StatusCode::UNAUTHORIZED,
            "NOT_FOUND" => StatusCode::NOT_FOUND,
            "ALREADY_EXISTS" | "REMOTE_MISMATCH" => StatusCode::CONFLICT,
            "CANCELLED" => StatusCode::from_u16(499).unwrap_or(StatusCode::BAD_REQUEST),
            "GIT_TIMEOUT" => StatusCode::GATEWAY_TIMEOUT,
            "DB_NOT_CONFIGURED" | "NOT_SUPPORTED" => StatusCode::SERVICE_UNAVAILABLE,
            _ => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }
}

/// 统一出口：格式化与日志只在这里做一次，Handler 内不重复写错误处理。
impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let status = self.status();
        if status.is_server_error() {
            log::error!(
                "[api] {} {} details={:?}",
                self.code,
                self.message,
                self.details
            );
        } else {
            log::debug!("[api] {} {}", self.code, self.message);
        }
        (status, Json(ApiResponse::<()>::fail(status, self))).into_response()
    }
}

impl From<sqlx::Error> for AppError {
    fn from(error: sqlx::Error) -> Self {
        match error {
            sqlx::Error::RowNotFound => AppError::new("NOT_FOUND", "记录不存在"),
            other => AppError::new("DB_ERROR", "数据库操作失败").with_details(other.to_string()),
        }
    }
}

impl From<JsonRejection> for AppError {
    fn from(rejection: JsonRejection) -> Self {
        AppError::new("VALIDATION", "请求体格式不正确").with_details(rejection.body_text())
    }
}

impl From<QueryRejection> for AppError {
    fn from(rejection: QueryRejection) -> Self {
        AppError::new("VALIDATION", "查询参数不正确").with_details(rejection.body_text())
    }
}

impl From<PathRejection> for AppError {
    fn from(rejection: PathRejection) -> Self {
        AppError::new("VALIDATION", "路径参数不正确").with_details(rejection.body_text())
    }
}
