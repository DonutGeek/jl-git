//! Repository 层：只做数据库访问与 SQL 方言细节，不含业务判断。

pub mod app_data;
pub mod chat;
pub mod project;
pub mod recent;
pub mod setup;
pub mod workspace;

use chrono::Utc;

/// 时间列统一存 ISO-8601 文本
pub fn now() -> String {
    Utc::now().to_rfc3339()
}

/// PostgreSQL 唯一约束冲突（SQLSTATE 23505）
pub fn is_unique_violation(error: &sqlx::Error) -> bool {
    match error {
        sqlx::Error::Database(db_error) => db_error.code().as_deref() == Some("23505"),
        _ => false,
    }
}
