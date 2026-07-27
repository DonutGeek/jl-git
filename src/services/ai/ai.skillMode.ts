import {
  hasPendingResumeIdentityRequest,
  parseDeclaredResumeAuthors,
} from "@/services/agent/agent.resumeIdentity";

import type { AgentChatMessage } from "@/types/ai";

export type AgentSkillMode = "resume" | "skill-creator" | null;

const RESUME_DRAFT_PATTERN =
  /(?:生成|撰写|写一?[下段份]|帮我写|出一?[下段份]).{0,12}(?:简历|项目经历)|(?:简历|项目经历).{0,12}(?:生成|成稿|模板)|write\s+(?:a\s+)?resume|\bgenerate\s+resume\b/i;
const RESUME_REVISION_PATTERN =
  /(?:优化|润色|改写|重写|精简|压缩|扩写|加强|调整).{0,12}(?:表述|项目经历|职责|技术栈|这一版|上面)|(?:make|rewrite|refine|shorten|expand).{0,20}(?:resume|experience|bullet)/i;
const SKILL_CREATOR_REQUEST_PATTERN =
  /(?:创建|新建|编写|设计|生成|制作|搭建|优化|更新|修改).{0,16}(?:鲸灵|codex)?\s*(?:skill|技能)(?:包|目录|文件)?|(?:create|build|design|generate|write|update|improve)\s+(?:an?\s+)?(?:codex\s+)?skill\b/i;
const SKILL_CREATOR_REVISION_PATTERN =
  /(?:修改|调整|优化|更新|补充|删掉|增加|重写).{0,20}(?:这个|上面|刚才|skill|技能|文件|规则)|(?:revise|update|improve|change|add|remove).{0,24}(?:skill|artifact|file|above|it)/i;

export const SKILL_CREATOR_AWAITING_INPUT_MARKER = "<!-- jlgit-skill-creator:awaiting-input -->";
export const SKILL_CREATOR_ARTIFACT_MARKER = "<!-- jlgit-skill-creator:artifact -->";

/** 返回本轮唯一启用的内置技能；null 表示通用 Git Agent。 */
export function getAgentSkillMode(messages: readonly AgentChatMessage[]): AgentSkillMode {
  if (isResumeSkillTurn(messages)) {
    return "resume";
  }
  if (isSkillCreatorTurn(messages)) {
    return "skill-creator";
  }
  return null;
}

/**
 * 是否进入简历技能：本轮用户消息显式 @简历，或明确要求生成简历/项目经历。
 * 普通 Git 问答不得因此走简历 system prompt。
 */
export function isResumeSkillTurn(messages: readonly AgentChatMessage[]): boolean {
  const lastUser = [...messages].reverse().find((message) => message.role === "user");
  if (!lastUser) {
    return false;
  }
  if (isExplicitResumeSkillRequest(lastUser)) {
    return true;
  }

  // 简历技能追问身份后，用户只需回答身份，不必再次 @简历。
  if (
    hasPendingResumeIdentityRequest(messages) &&
    parseDeclaredResumeAuthors(lastUser.content).length > 0
  ) {
    return true;
  }

  // 仅对紧邻简历成稿的明确修改意图续一轮，普通 Git 问题立即回到通用 Agent。
  const previousAssistant = [...messages]
    .slice(0, -1)
    .reverse()
    .find((message) => message.role === "assistant");
  return Boolean(
    previousAssistant?.content.includes("## 项目经历") &&
    RESUME_REVISION_PATTERN.test(lastUser.content),
  );
}

/** 显式 @简历或直接提出成稿请求。 */
export function isExplicitResumeSkillRequest(message: AgentChatMessage): boolean {
  if (message.role !== "user") {
    return false;
  }
  if (message.mentions?.some((mention) => mention.type === "plugin" && mention.id === "resume")) {
    return true;
  }
  // 无 @ 时仅匹配明确成稿意图，避免普通叙述中的「简历」二字误触发。
  return RESUME_DRAFT_PATTERN.test(message.content);
}

/** 是否进入 Skill Creator；普通仓库中的 SKILL.md 问答不得误触发。 */
export function isSkillCreatorTurn(messages: readonly AgentChatMessage[]): boolean {
  const lastUser = [...messages].reverse().find((message) => message.role === "user");
  if (!lastUser) {
    return false;
  }
  if (isExplicitSkillCreatorRequest(lastUser)) {
    return true;
  }

  const previousAssistant = [...messages]
    .slice(0, -1)
    .reverse()
    .find((message) => message.role === "assistant");
  if (!previousAssistant) {
    return false;
  }
  if (previousAssistant.content.includes(SKILL_CREATOR_AWAITING_INPUT_MARKER)) {
    return true;
  }
  return (
    previousAssistant.content.includes(SKILL_CREATOR_ARTIFACT_MARKER) &&
    SKILL_CREATOR_REVISION_PATTERN.test(lastUser.content)
  );
}

/** 显式 @技能创建，或直接要求创建/更新 Codex Skill。 */
export function isExplicitSkillCreatorRequest(message: AgentChatMessage): boolean {
  if (message.role !== "user") {
    return false;
  }
  if (
    message.mentions?.some((mention) => mention.type === "plugin" && mention.id === "skill-creator")
  ) {
    return true;
  }
  return SKILL_CREATOR_REQUEST_PATTERN.test(message.content);
}
