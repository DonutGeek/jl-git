/**
 * Skill Creator 域 prompts：仅在技能触发后加载，与通用 Agent 和其它技能隔离。
 */
export { buildSkillCreatorSystemPrompt } from "./system";
export { buildSkillCreatorIdentityPrompt } from "./identity";
export { SKILL_CREATOR_WORKFLOW_PROMPT } from "./workflow";
export { SKILL_CREATOR_CONTRACT_PROMPT } from "./contract";
