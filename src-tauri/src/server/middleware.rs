//! CORS 与 token 校验。服务只监听 127.0.0.1，token 用于隔离同机其他进程。

use axum::extract::{Request, State};
use axum::http::{header, HeaderValue, Method};
use axum::middleware::Next;
use axum::response::Response;
use tower_http::cors::CorsLayer;

use crate::error::AppError;
use crate::state::AppState;

/// Tauri webview 的 origin：macOS/Linux 是 `tauri://localhost`，
/// Windows 是 `http://tauri.localhost`，开发期是 Vite 的 `http://localhost:1420`。
/// 不放开这三个，请求会在 preflight 阶段就被浏览器拦掉。
const ALLOWED_ORIGINS: [&str; 3] = [
    "tauri://localhost",
    "http://tauri.localhost",
    "http://localhost:1420",
];

pub fn cors_layer() -> CorsLayer {
    let origins: Vec<HeaderValue> = ALLOWED_ORIGINS
        .iter()
        .filter_map(|origin| HeaderValue::from_str(origin).ok())
        .collect();

    CorsLayer::new()
        .allow_origin(origins)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE])
}

/// 校验 `Authorization: Bearer <token>`；预检请求直接放行交给 CorsLayer。
pub async fn require_token(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Result<Response, AppError> {
    if request.method() == Method::OPTIONS {
        return Ok(next.run(request).await);
    }

    let presented = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .map(str::trim)
        .unwrap_or_default();

    if presented.is_empty() || presented != state.token() {
        return Err(AppError::new("UNAUTHORIZED", "本地服务凭据无效"));
    }

    Ok(next.run(request).await)
}
