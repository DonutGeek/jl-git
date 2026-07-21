import { RESUME_DUTIES_PROMPT } from "@/prompts/resume/duties";
import { buildResumeIdentityPrompt } from "@/prompts/resume/identity";
import { RESUME_PERMISSIONS_PROMPT } from "@/prompts/resume/permissions";
import { RESUME_WRITING_PROMPT } from "@/prompts/resume/writing";

/**
 * 按「身份 → 权限 → 职责 → 简历指令 → 成稿写法 → 仓库画像」组装简历插件系统提示。
 * 与鲸灵通用对话 / Git commit prompt 完全隔离。
 */
export function buildResumeSystemPrompt(
  locale: string,
  projectContext: string,
  resumeInstructions = "",
): string {
  const parts: string[] = [
    ...buildResumeIdentityPrompt(locale),
    "",
    ...RESUME_PERMISSIONS_PROMPT,
    "",
    ...RESUME_DUTIES_PROMPT,
  ];

  const trimmed = resumeInstructions.trim();
  if (trimmed) {
    parts.push("", "## 简历指令", trimmed);
  }

  // 成稿硬规则放在指令之后，避免旧偏好把「依据」又写回正文
  parts.push("", ...RESUME_WRITING_PROMPT);
  parts.push("", "## 仓库画像（只读查询结果，可能被截断）", projectContext);
  return parts.join("\n");
}
