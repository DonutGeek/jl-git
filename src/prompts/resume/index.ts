/**
 * 简历技能域 prompts：仅在技能触发后加载，与通用 Agent / Git Prompt 隔离。
 * 与鲸灵通用对话、Git 提交/PR 完全隔离。
 */
export { buildResumeSystemPrompt } from "./system";
export { buildResumeIdentityPrompt } from "./identity";
export { RESUME_DUTIES_PROMPT } from "./duties";
export { RESUME_PERMISSIONS_PROMPT } from "./permissions";
export { RESUME_WRITING_PROMPT } from "./writing";
