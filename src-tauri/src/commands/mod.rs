//! 前端可调用的 Tauri Command，按域拆文件，避免 `lib.rs` 膨胀。
//!
//! - `project`：项目 / 工作区登记（SQLite）
//! - `git_ops`：Git CLI（status / commit / push…）
//! - `app_data`：备份导入导出
//! - `chat`：鲸灵会话持久化
//! - `document`：附件文本提取
//! - `ssh_keys`：SSH 公钥管理
//! - `system`：打开目录、更新、磁盘等

pub mod app_data;
pub mod chat;
pub mod document;
pub mod git_ops;
pub mod project;
pub mod ssh_keys;
pub mod system;
