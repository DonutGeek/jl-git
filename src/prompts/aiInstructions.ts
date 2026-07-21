import { getDefaultCommitInstructions } from "@/prompts/git/commitInstructions";
import { getDefaultPullRequestInstructions } from "@/prompts/git/pullRequestInstructions";
import { getDefaultResumeInstructions } from "@/prompts/resume/instructions";
import type { AiInstructions } from "@/services/ai/ai.settings";

/**
 * 聚合各域默认指令，供 Store 回退使用。
 * 文案本体按域拆在 `git/`、`resume/`，此处只做组装。
 */
export function getDefaultAiInstructions(locale: string): AiInstructions {
  return {
    commit: getDefaultCommitInstructions(locale),
    pullRequest: getDefaultPullRequestInstructions(locale),
    resume: getDefaultResumeInstructions(locale),
  };
}
