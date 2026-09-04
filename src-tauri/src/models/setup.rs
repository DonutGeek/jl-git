use serde::{Deserialize, Serialize};

/// 数据库连接配置；落盘在 Tauri Store `db-config.json`。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DbConfig {
    pub host: String,
    pub port: u16,
    pub user: String,
    pub password: String,
    pub database: String,
}

impl Default for DbConfig {
    fn default() -> Self {
        Self {
            host: "127.0.0.1".to_string(),
            port: 5432,
            user: default_user(),
            password: String::new(),
            database: "jl_git".to_string(),
        }
    }
}

/// Homebrew / Postgres.app 建库时把本机登录名作为超级用户角色，
/// 比固定填 `postgres` 更可能一次连通；取不到时才回退。
fn default_user() -> String {
    let name = whoami::username();
    if name.trim().is_empty() {
        "postgres".to_string()
    } else {
        name
    }
}

impl DbConfig {
    /// 连接目标业务库
    pub fn connection_url(&self) -> String {
        self.url_for(&self.database)
    }

    /// 连接维护库（建库时用，`CREATE DATABASE` 不能在目标库自身里执行）
    pub fn maintenance_url(&self) -> String {
        self.url_for("postgres")
    }

    fn url_for(&self, database: &str) -> String {
        format!(
            "postgres://{}:{}@{}:{}/{}",
            encode(&self.user),
            encode(&self.password),
            self.host,
            self.port,
            encode(database)
        )
    }
}

/// 用户名/口令可能含 `@` `:` `/` 等字符，必须百分号编码后再拼进 URL。
fn encode(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    for byte in raw.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*byte as char)
            }
            other => out.push_str(&format!("%{other:02X}")),
        }
    }
    out
}

/// 向导第一步：环境检测结果
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupDetectResult {
    /// 默认端口 TCP 是否可达
    pub port_reachable: bool,
    pub host: String,
    pub port: u16,
    /// `psql` 可执行文件路径（未找到为 None）
    pub psql_path: Option<String>,
    pub psql_version: Option<String>,
    /// 连接表单的建议默认值，避免前端再硬编码一份
    pub suggested_user: String,
    pub suggested_database: String,
    /// 官方下载页，前端用 `openExternalUrl` 打开
    pub download_url: String,
}

/// 向导第二步：试连结果
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupTestResult {
    pub ok: bool,
    pub server_version: Option<String>,
    /// 目标库是否已存在（不存在则第三步会创建）
    pub database_exists: bool,
}

/// 应用启动与向导共用的就绪状态
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupStatus {
    /// 已落盘连接配置
    pub configured: bool,
    /// 连接池已建立
    pub connected: bool,
    /// 迁移已跑完
    pub schema_ready: bool,
    pub server_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub config: Option<DbConfigView>,
}

/// 回显给前端的配置（不含口令）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DbConfigView {
    pub host: String,
    pub port: u16,
    pub user: String,
    pub database: String,
}

impl From<&DbConfig> for DbConfigView {
    fn from(config: &DbConfig) -> Self {
        Self {
            host: config.host.clone(),
            port: config.port,
            user: config.user.clone(),
            database: config.database.clone(),
        }
    }
}

/// 向导提交的连接表单
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupConnectionInput {
    pub host: String,
    pub port: u16,
    pub user: String,
    #[serde(default)]
    pub password: String,
    pub database: String,
}

impl From<SetupConnectionInput> for DbConfig {
    fn from(input: SetupConnectionInput) -> Self {
        Self {
            host: input.host.trim().to_string(),
            port: input.port,
            user: input.user.trim().to_string(),
            password: input.password,
            database: input.database.trim().to_string(),
        }
    }
}

/// 建库 + 迁移结果
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupInitResult {
    pub ok: bool,
    /// 本次是否新建了数据库
    pub database_created: bool,
    pub schema_ready: bool,
}
