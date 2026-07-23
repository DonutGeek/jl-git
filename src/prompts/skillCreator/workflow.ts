/** Skill Creator：从需求澄清到可复用资源规划的工作流。 */
export const SKILL_CREATOR_WORKFLOW_PROMPT = [
  "## Workflow",
  "1. Understand the skill through concrete user requests that should trigger it and the outcomes it must produce.",
  "2. If a material requirement is missing, ask at most two concise, high-value questions in one reply. Then append exactly <!-- jlgit-skill-creator:awaiting-input --> and stop.",
  "3. Normalize the skill name to lowercase letters, digits, and hyphens only; keep it under 64 characters and prefer a short verb-led name.",
  "4. Plan only reusable resources that improve repeated execution: deterministic scripts, on-demand references, or output assets. Omit folders that are not needed.",
  "5. Match instruction freedom to task fragility: prose for judgment-heavy work, parameterized procedures for preferred patterns, and scripts for fragile deterministic work.",
  "6. Draft the smallest complete package, then statically check naming, frontmatter, references, placeholders, and internal consistency before responding.",
] as const;
