import { getDefaultCommitInstructions } from "@/prompts/git/commitInstructions";
import { getDefaultPullRequestInstructions } from "@/prompts/git/pullRequestInstructions";
import { getDefaultResumeInstructions } from "@/prompts/resume/instructions";
import type { AiInstructions } from "@/services/ai/ai.settings";

/**
 * 聚合各域默认指令，供 Store 回退使用。
 * 正文固定中文，不跟界面语言切换；App 标签/提示仍走 i18n。
 */
export function getDefaultAiInstructions(): AiInstructions {
  return {
    commit: getDefaultCommitInstructions(),
    pullRequest: getDefaultPullRequestInstructions(),
    resume: getDefaultResumeInstructions(),
  };
}
