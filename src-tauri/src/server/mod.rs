//! 内嵌 Axum 服务的生命周期：随 Tauri 启动、随 Tauri 优雅关闭。

pub mod extract;
pub mod middleware;
pub mod router;

use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use tokio::net::TcpListener;
use tokio::sync::oneshot;
use uuid::Uuid;

use crate::error::AppError;
use crate::state::AppState;

/// 关闭时最多等待服务收尾的时长，超时则直接放行退出。
const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(3);

/// 全进程只允许一个实例；子窗创建不会重入 `setup()`，这里再兜一层。
static STARTED: OnceLock<()> = OnceLock::new();

/// 交给 Tauri 托管：前端经 `server_info` 读端口与 token，退出时用它发关闭信号。
pub struct ServerHandle {
    pub port: u16,
    pub token: String,
    shutdown: Mutex<Option<oneshot::Sender<()>>>,
    finished: Mutex<Option<oneshot::Receiver<()>>>,
}

impl ServerHandle {
    /// 通知服务停止接收新连接并收尾。可重复调用，第二次是空操作。
    pub fn shutdown(&self) {
        let sender = self
            .shutdown
            .lock()
            .ok()
            .and_then(|mut guard| guard.take());
        if let Some(sender) = sender {
            let _ = sender.send(());
        }
    }

    /// 带超时等待服务退出，避免关窗时卡住主线程。
    pub fn wait_for_exit(&self) {
        let receiver = self
            .finished
            .lock()
            .ok()
            .and_then(|mut guard| guard.take());
        let Some(receiver) = receiver else {
            return;
        };
        let result = tauri::async_runtime::block_on(async move {
            tokio::time::timeout(SHUTDOWN_TIMEOUT, receiver).await
        });
        if result.is_err() {
            log::warn!("[server] 等待 Axum 退出超时（{SHUTDOWN_TIMEOUT:?}），继续退出流程");
        }
    }
}

/// 先同步 bind 再 spawn：端口在 `setup()` 返回前就已确定，
/// 且绑定失败会当场变成启动错误，而不是后台静默失败。
pub fn start(state: AppState) -> Result<ServerHandle, AppError> {
    if STARTED.set(()).is_err() {
        return Err(AppError::new("INTERNAL", "本地服务已启动，拒绝重复启动"));
    }

    let listener = tauri::async_runtime::block_on(TcpListener::bind(("127.0.0.1", 0))).map_err(
        |error| {
            log::error!("[server] 绑定 127.0.0.1 失败: {error}");
            AppError::new("INTERNAL", "无法启动本地服务").with_details(error.to_string())
        },
    )?;
    let port = listener
        .local_addr()
        .map_err(|error| {
            log::error!("[server] 读取监听端口失败: {error}");
            AppError::new("INTERNAL", "无法读取本地服务端口").with_details(error.to_string())
        })?
        .port();

    let token = state.token().to_string();
    let app = router::build(state);
    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
    let (finished_tx, finished_rx) = oneshot::channel::<()>();

    tauri::async_runtime::spawn(async move {
        let serve = axum::serve(listener, app).with_graceful_shutdown(async move {
            let _ = shutdown_rx.await;
        });
        if let Err(error) = serve.await {
            log::error!("[server] Axum 异常退出: {error}");
        }
        let _ = finished_tx.send(());
    });

    log::info!("[server] 本地服务已监听 127.0.0.1:{port}");

    Ok(ServerHandle {
        port,
        token,
        shutdown: Mutex::new(Some(shutdown_tx)),
        finished: Mutex::new(Some(finished_rx)),
    })
}

/// 每次启动生成一次性凭据，只在本进程内经 `server_info` 下发给前端。
pub fn generate_token() -> String {
    Uuid::new_v4().simple().to_string()
}
