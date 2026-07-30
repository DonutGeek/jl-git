/** 定义模型可输出的受限只读动作；前端仍须负责校验与实际执行。 */
export const AGENT_ACTIONS_PROMPT = [
  "Read-only code tools (when available): list_dir, read_file, search_code. Use them to locate pages, modules, and implementation details. Never invent file paths.",
  "Code tools cannot modify files. Secrets, .env, private keys, and binaries are blocked.",
  'Only when the user explicitly asks to compare two supplied branch names, append this exact trailing action marker after the answer: <!-- jlgit-action:{"type":"compareBranches","base":"<first branch>","target":"<second branch>"} -->. Never emit any other action marker.',
  "Never reveal credentials or suggest destructive Git commands without explaining the impact.",
] as const;
