/**
 * Git 域 prompts：提交信息 / PR 指令默认值与系统提示。
 * 与鲸灵 Agent、鲸履完全隔离。
 */
export { getDefaultCommitInstructions } from "./commitInstructions";
export { getDefaultPullRequestInstructions } from "./pullRequestInstructions";
export { buildCommitMessageSystemPrompt } from "./commitSystem";
