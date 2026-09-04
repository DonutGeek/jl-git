use axum::http::StatusCode;
use serde::Serialize;

use crate::error::AppError;

/// 语义错误码；与信封的数字 `code`（HTTP 状态码）互补，前端按它做业务分支。
#[derive(Debug, Serialize)]
pub struct ApiErrorBody {
    pub code: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
}

/// 统一响应信封：`{ code, message, data }`，失败时追加 `error.code`。
#[derive(Debug, Serialize)]
pub struct ApiResponse<T> {
    pub code: u16,
    pub message: String,
    pub data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ApiErrorBody>,
}

impl<T> ApiResponse<T> {
    pub fn success(data: T) -> Self {
        Self {
            code: 0,
            message: "success".to_string(),
            data: Some(data),
            error: None,
        }
    }

    pub fn fail(status: StatusCode, error: AppError) -> Self {
        Self {
            code: status.as_u16(),
            message: error.message,
            data: None,
            error: Some(ApiErrorBody {
                code: error.code,
                details: error.details,
            }),
        }
    }
}
