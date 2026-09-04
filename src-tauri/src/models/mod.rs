//! 数据结构层：响应信封 + 各域的行模型与请求/响应模型。
//! Git / FS 相关结构仍留在 `git/` 各模块，按域迁移到 HTTP 时再搬进来。

pub mod app_data;
pub mod chat;
pub mod project;
pub mod response;
pub mod setup;
pub mod workspace;

pub use response::ApiResponse;
