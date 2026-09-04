//! 请求体提取器：把 Axum 的原生 rejection 收敛成 `AppError`，
//! 使参数错误也走统一信封，而不是裸文本响应。

use axum::extract::{FromRequest, Request};
use axum::Json;
use serde::de::DeserializeOwned;

use crate::error::AppError;

pub struct AppJson<T>(pub T);

impl<S, T> FromRequest<S> for AppJson<T>
where
    S: Send + Sync,
    T: DeserializeOwned,
{
    type Rejection = AppError;

    async fn from_request(request: Request, state: &S) -> Result<Self, Self::Rejection> {
        let Json(value) = Json::<T>::from_request(request, state).await?;
        Ok(AppJson(value))
    }
}
