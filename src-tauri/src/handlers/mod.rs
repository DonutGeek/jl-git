//! Handler 层：只解析 HTTP 入参、调 Service、包信封。
//! 不写业务判断，不写错误处理（用 `?` 交给 `AppError` 的 `IntoResponse`）。

pub mod health;
pub mod setup;
