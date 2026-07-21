/**
 * 简历插件域 prompts：系统提示组装 + 内置默认指令。
 * 与鲸灵通用对话、Git 提交/PR 完全隔离。
 */
export { buildResumeSystemPrompt } from "./system";
export { getDefaultResumeInstructions } from "./instructions";
export { buildResumeIdentityPrompt } from "./identity";
export { RESUME_DUTIES_PROMPT } from "./duties";
export { RESUME_PERMISSIONS_PROMPT } from "./permissions";
export { RESUME_WRITING_PROMPT } from "./writing";
