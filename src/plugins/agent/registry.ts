import type { LucideIcon } from "lucide-react";
import { FileUser } from "lucide-react";

/** 鲸灵内置插件（首期仅简历；单仓/多仓共用壳） */
export interface AgentPluginDefinition {
  id: string;
  /** Mentions 用 id，带 plugin: 前缀防与项目 id 冲突 */
  mentionId: string;
  /** @ 显示名的 i18n key */
  mentionDisplayKey: string;
  titleKey: string;
  descriptionKey: string;
  /** 「立即试用」预填示例文案的 i18n key（跟在 @插件 后） */
  tryExampleKey: string;
  icon: LucideIcon;
}

export const AGENT_RESUME_PLUGIN: AgentPluginDefinition = {
  id: "resume",
  mentionId: "plugin:resume",
  mentionDisplayKey: "agent.pluginResumeMention",
  titleKey: "agent.pluginResumeTitle",
  descriptionKey: "agent.pluginResumeDescription",
  tryExampleKey: "agent.pluginResumeTryExample",
  icon: FileUser,
};

/** 已注册内置插件（顺序即插件列表展示顺序） */
export const AGENT_PLUGINS: readonly AgentPluginDefinition[] = [
  AGENT_RESUME_PLUGIN,
];

export function getAgentPluginByMentionId(
  mentionId: string,
): AgentPluginDefinition | undefined {
  return AGENT_PLUGINS.find((plugin) => plugin.mentionId === mentionId);
}

/** 拼 Mentions 标记（与 react-mentions-ts 默认 markup 一致） */
export function buildAgentMentionMarkup(display: string, id: string): string {
  return `@[${display}](${id})`;
}

/** 拼「立即试用」草稿：@插件 + 示例语 */
export function buildAgentPluginTryMarkup(
  display: string,
  mentionId: string,
  example: string,
): string {
  const token = buildAgentMentionMarkup(display, mentionId);
  const trimmedExample = example.trim();
  if (!trimmedExample) {
    return `${token} `;
  }
  return `${token} ${trimmedExample}`;
}

export function appendAgentMentionMarkup(
  currentMarkup: string,
  display: string,
  id: string,
): string {
  const token = buildAgentMentionMarkup(display, id);
  if (currentMarkup.includes(`](${id})`)) {
    return currentMarkup;
  }
  const trimmed = currentMarkup.trimEnd();
  if (!trimmed) {
    return `${token} `;
  }
  return `${trimmed} ${token} `;
}

export function agentProjectMentionId(projectId: string): string {
  return `project:${projectId}`;
}

export function parseAgentProjectMentionId(mentionId: string): string | null {
  if (!mentionId.startsWith("project:")) {
    return null;
  }
  const id = mentionId.slice("project:".length);
  return id.length > 0 ? id : null;
}
