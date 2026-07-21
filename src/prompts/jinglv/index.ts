/**
 * 鲸履域 prompts：系统提示组装 + 设置默认指令。
 * 与鲸灵 Agent、Git 提交/PR 完全隔离。
 */
export { buildJinglvSystemPrompt } from "./system";
export { getDefaultJinglvInstructions } from "./instructions";
export { buildJinglvIdentityPrompt } from "./identity";
export { JINGLV_DUTIES_PROMPT } from "./duties";
export { JINGLV_PERMISSIONS_PROMPT } from "./permissions";
export { JINGLV_WRITING_PROMPT } from "./writing";
