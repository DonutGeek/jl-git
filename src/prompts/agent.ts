import { AGENT_ACTIONS_PROMPT } from "@/prompts/agent/actions";
import { AGENT_FACTUALITY_PROMPT } from "@/prompts/agent/factuality";
import { buildAgentIdentityPrompt } from "@/prompts/agent/identity";
import { AGENT_RESPONSE_PROMPT } from "@/prompts/agent/response";
import { AGENT_SAFETY_PROMPT } from "@/prompts/agent/safety";

/**
 * 按“身份 → 安全 → 事实 → 回复 → 动作”的固定顺序组装系统提示词。
 * 各分类规则保持独立，避免新增能力时改动无关约束。
 */
export function buildAgentSystemPrompt(locale: string, repositoryContext: string): string {
  const language = locale === "zh-CN" ? "Simplified Chinese" : "English";
  return [
    ...buildAgentIdentityPrompt(language),
    ...AGENT_SAFETY_PROMPT,
    ...AGENT_FACTUALITY_PROMPT,
    ...AGENT_RESPONSE_PROMPT,
    ...AGENT_ACTIONS_PROMPT,
    "Current repository snapshot:",
    repositoryContext,
  ].join("\n");
}
