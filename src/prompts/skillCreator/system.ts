import { AGENT_SAFETY_PROMPT } from "@/prompts/agent/safety";
import { SKILL_CREATOR_CONTRACT_PROMPT } from "@/prompts/skillCreator/contract";
import { buildSkillCreatorIdentityPrompt } from "@/prompts/skillCreator/identity";
import { SKILL_CREATOR_WORKFLOW_PROMPT } from "@/prompts/skillCreator/workflow";

/** 按「身份 → 宿主安全 → 工作流 → 成稿契约」组装 Skill Creator 提示词。 */
export function buildSkillCreatorSystemPrompt(locale: string, projectContext: string): string {
  return [
    ...buildSkillCreatorIdentityPrompt(locale),
    "",
    ...AGENT_SAFETY_PROMPT,
    "",
    ...SKILL_CREATOR_WORKFLOW_PROMPT,
    "",
    ...SKILL_CREATOR_CONTRACT_PROMPT,
    "",
    "## Optional repository context (read-only and possibly truncated)",
    projectContext,
  ].join("\n");
}
