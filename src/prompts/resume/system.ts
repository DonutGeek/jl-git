import { AGENT_SAFETY_PROMPT } from "@/prompts/agent/safety";
import { RESUME_DUTIES_PROMPT } from "@/prompts/resume/duties";
import { buildResumeIdentityPrompt } from "@/prompts/resume/identity";
import { RESUME_PERMISSIONS_PROMPT } from "@/prompts/resume/permissions";
import { RESUME_WRITING_PROMPT } from "@/prompts/resume/writing";

/**
 * 按「身份 → 宿主安全 → 工作流 → 权限 → 成稿契约 → 仓库画像」组装简历技能提示。
 * 与鲸灵通用对话 / Git commit prompt 完全隔离。
 */
export function buildResumeSystemPrompt(locale: string, projectContext: string): string {
  const parts: string[] = [
    ...buildResumeIdentityPrompt(locale),
    "",
    ...AGENT_SAFETY_PROMPT,
    "",
    ...RESUME_DUTIES_PROMPT,
    "",
    ...RESUME_PERMISSIONS_PROMPT,
    "",
    ...RESUME_WRITING_PROMPT,
    "",
    "## 仓库画像（只读查询结果，可能被截断）",
    projectContext,
  ];
  return parts.join("\n");
}
