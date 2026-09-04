//! Service 层：业务规则的唯一落点。
//! HTTP Handler 与 Tauri Command 都是薄壳，共用这里的实现。

pub mod app_data;
pub mod chat;
pub mod project;
pub mod setup;
pub mod workspace;
