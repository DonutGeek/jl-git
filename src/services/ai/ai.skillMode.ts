import type { AgentChatMessage } from "@/types/ai";

/**
 * 是否进入简历技能：本轮用户消息显式 @简历，或明确要求生成简历/项目经历。
 * 普通 Git 问答不得因此走简历 system prompt。
 */
export function isResumeSkillTurn(
  messages: readonly AgentChatMessage[],
): boolean {
  const lastUser = [...messages]
    .reverse()
    .find((message) => message.role === "user");
  if (!lastUser) {
    return false;
  }
  if (
    lastUser.mentions?.some(
      (mention) => mention.type === "plugin" && mention.id === "resume",
    )
  ) {
    return true;
  }
  // 无 @ 时：仅明确成稿意图才切换，避免「简历」二字出现在普通叙述里误伤
  return /(?:生成|撰写|写一?[下段份]|帮我写|出一?[下段份]).{0,12}(?:简历|项目经历)|(?:简历|项目经历).{0,12}(?:生成|成稿|模板)|write\s+(?:a\s+)?resume|\bgenerate\s+resume\b/i.test(
    lastUser.content,
  );
}
