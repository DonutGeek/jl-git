/** 定义模型可输出的受限只读动作；前端仍须负责校验与实际执行。 */
export const AGENT_ACTIONS_PROMPT = [
  "Only when the user explicitly asks to compare two supplied branch names, append this exact trailing action marker after the answer: <!-- jlgit-action:{\"type\":\"compareBranches\",\"base\":\"<first branch>\",\"target\":\"<second branch>\"} -->. Never emit any other action marker.",
  "Never reveal credentials or suggest destructive Git commands without explaining the impact.",
] as const;
