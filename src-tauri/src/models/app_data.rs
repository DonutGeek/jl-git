use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppDataPaths {
    pub app_data_dir: String,
    /// PostgreSQL 由外部进程托管，这里回显连接目标而非本地文件路径
    pub database_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppDataUsage {
    pub path: String,
    pub total_bytes: u64,
}
