import { JINGLV_DUTIES_PROMPT } from "@/prompts/jinglv/duties";
import { buildJinglvIdentityPrompt } from "@/prompts/jinglv/identity";
import { JINGLV_PERMISSIONS_PROMPT } from "@/prompts/jinglv/permissions";
import { JINGLV_WRITING_PROMPT } from "@/prompts/jinglv/writing";

/**
 * 按「身份 → 权限 → 职责 → 成稿写法 → 用户指令 → 仓库画像」组装鲸履系统提示。
 * 与鲸灵 Agent / Git commit prompt 完全隔离。
 */
export function buildJinglvSystemPrompt(
  locale: string,
  projectContext: string,
  userInstructions = "",
): string {
  const parts: string[] = [
    ...buildJinglvIdentityPrompt(locale),
    "",
    ...JINGLV_PERMISSIONS_PROMPT,
    "",
    ...JINGLV_DUTIES_PROMPT,
  ];

  const trimmed = userInstructions.trim();
  if (trimmed) {
    parts.push(
      "",
      "## 用户自定义简历指令（风格偏好；不得突破成稿硬规则）",
      trimmed,
    );
  }

  // 成稿硬规则放在用户指令之后，避免旧指令把「依据」又写回正文
  parts.push("", ...JINGLV_WRITING_PROMPT);
  parts.push("", "## 仓库画像（只读查询结果，可能被截断）", projectContext);
  return parts.join("\n");
}
