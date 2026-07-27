import { FileUser, Sparkles, type LucideIcon } from "lucide-react";

/** 鲸灵扩展（插件 / 技能共用结构；单仓/多仓共用壳） */
export interface AgentPluginDefinition {
  id: string;
  /** Mentions 用 id，带 plugin: 前缀防与项目 id 冲突（历史兼容） */
  mentionId: string;
  /** @ 显示名的 i18n key */
  mentionDisplayKey: string;
  titleKey: string;
  descriptionKey: string;
  /** 「立即试用」预填示例文案的 i18n key（跟在 @提及 后） */
  tryExampleKey: string;
  icon: LucideIcon;
}

/** 简历能力：归入技能（非插件列表） */
export const AGENT_RESUME_SKILL: AgentPluginDefinition = {
  id: "resume",
  mentionId: "plugin:resume",
  mentionDisplayKey: "agent.pluginResumeMention",
  titleKey: "agent.pluginResumeTitle",
  descriptionKey: "agent.pluginResumeDescription",
  tryExampleKey: "agent.pluginResumeTryExample",
  icon: FileUser,
};

/** @deprecated 使用 AGENT_RESUME_SKILL */
export const AGENT_RESUME_PLUGIN = AGENT_RESUME_SKILL;

/** Skill Creator：通过对话生成或优化可落盘的鲸灵 Skill 包 */
export const AGENT_SKILL_CREATOR_SKILL: AgentPluginDefinition = {
  id: "skill-creator",
  mentionId: "plugin:skill-creator",
  mentionDisplayKey: "agent.pluginSkillCreatorMention",
  titleKey: "agent.pluginSkillCreatorTitle",
  descriptionKey: "agent.pluginSkillCreatorDescription",
  tryExampleKey: "agent.pluginSkillCreatorTryExample",
  icon: Sparkles,
};

/** 已注册内置插件（顺序即插件列表展示顺序） */
export const AGENT_PLUGINS: readonly AgentPluginDefinition[] = [];

/** 已注册内置技能（顺序即技能列表展示顺序） */
export const AGENT_SKILLS: readonly AgentPluginDefinition[] = [
  AGENT_RESUME_SKILL,
  AGENT_SKILL_CREATOR_SKILL,
];

/** 插件 + 技能（查找 / 卸载偏好用） */
export const AGENT_EXTENSIONS: readonly AgentPluginDefinition[] = [
  ...AGENT_PLUGINS,
  ...AGENT_SKILLS,
];

export function getAgentPluginByMentionId(mentionId: string): AgentPluginDefinition | undefined {
  return AGENT_EXTENSIONS.find((item) => item.mentionId === mentionId);
}

/** 拼 Mentions 标记（与 react-mentions-ts 默认 markup 一致） */
export function buildAgentMentionMarkup(display: string, id: string): string {
  return `@[${display}](${id})`;
}

/** 拼「立即试用」草稿：@扩展 + 示例语 */
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
