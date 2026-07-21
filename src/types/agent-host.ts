/**
 * 鲸灵宿主（对内：单仓鲸灵 / 多仓鲸灵）。
 * @see docs/superpowers/specs/2026-07-21-unified-jingling-agent-design.md
 */
export type AgentHost = "project" | "global";

/** 单仓鲸灵：主窗，仅当前项目 */
export const AGENT_HOST_PROJECT: AgentHost = "project";

/** 多仓鲸灵：子窗，已登记多仓（首期只读 + 插件） */
export const AGENT_HOST_GLOBAL: AgentHost = "global";
