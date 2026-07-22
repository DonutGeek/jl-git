use serde::Serialize;
use thiserror::Error;

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
}
