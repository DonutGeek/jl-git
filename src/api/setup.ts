import { requestClient } from "@/utils/http";

// 首启配置向导接口：serverInfo 走 Tauri Command（引导阶段 baseURL 还没定），
// 其余 /api/setup/* 走内嵌 Axum 服务。

export interface ServerInfo {
  port: number;
  token: string;
  baseUrl: string;
}

export interface DbConfigView {
  host: string;
  port: number;
  user: string;
  database: string;
}

export interface SetupStatus {
  /** 已落盘连接配置 */
  configured: boolean;
  /** 连接池已建立 */
  connected: boolean;
  /** 迁移已跑完 */
  schemaReady: boolean;
  serverVersion?: string | null;
  config?: DbConfigView;
}

export interface SetupDetectResult {
  portReachable: boolean;
  host: string;
  port: number;
  psqlPath?: string | null;
  psqlVersion?: string | null;
  /** 本机登录用户名；Homebrew / Postgres.app 的超级用户角色通常就是它 */
  suggestedUser: string;
  suggestedDatabase: string;
  downloadUrl: string;
}

export interface SetupConnectionInput {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export interface SetupTestResult {
  ok: boolean;
  serverVersion?: string | null;
  /** 目标库是否已存在；不存在则初始化步骤会创建 */
  databaseExists: boolean;
}

export interface SetupInitResult {
  ok: boolean;
  databaseCreated: boolean;
  schemaReady: boolean;
}

/** 读取内嵌服务端口与一次性凭据 */
export async function getServerInfo(): Promise<ServerInfo> {
  return requestClient.post<ServerInfo>("serverInfo");
}

/** 数据库是否已配通 */
export async function getSetupStatus(): Promise<SetupStatus> {
  return requestClient.get<SetupStatus>("/api/setup/status");
}

/** 探测本机 5432 可达性与 psql 版本 */
export async function detectPostgres(): Promise<SetupDetectResult> {
  return requestClient.post<SetupDetectResult>("/api/setup/detect");
}

/** 用表单参数试连，返回版本与目标库是否存在 */
export async function testDbConnection(input: SetupConnectionInput): Promise<SetupTestResult> {
  return requestClient.post<SetupTestResult, SetupConnectionInput>(
    "/api/setup/test-connection",
    input,
  );
}

/** 按需建库并执行迁移 */
export async function initDatabase(input: SetupConnectionInput): Promise<SetupInitResult> {
  return requestClient.post<SetupInitResult, SetupConnectionInput>("/api/setup/init", input);
}

/** 落盘配置并装入连接池，此后业务接口才会放行 */
export async function saveDbConfig(input: SetupConnectionInput): Promise<SetupStatus> {
  return requestClient.post<SetupStatus, SetupConnectionInput>("/api/setup/save", input);
}
