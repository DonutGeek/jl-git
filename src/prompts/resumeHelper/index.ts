/**
 * 简历帮域 prompts：系统提示组装 + 设置默认指令。
 * 与鲸灵 Agent、Git 提交/PR 完全隔离。
 */
export { buildResumeHelperSystemPrompt } from "./system";
export { getDefaultResumeHelperInstructions } from "./instructions";
export { buildResumeHelperIdentityPrompt } from "./identity";
export { RESUME_HELPER_DUTIES_PROMPT } from "./duties";
export { RESUME_HELPER_PERMISSIONS_PROMPT } from "./permissions";
