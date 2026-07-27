/**
 * Git：分支名称生成的系统提示。
 * 与提交信息 / 鲸灵 Agent / 简历插件隔离。
 */
export function buildBranchNameSystemPrompt(
  locale: string,
  prefix: string,
): string {
  const languageHint =
    locale === "zh-CN"
      ? "The user detail may be in Chinese; translate the meaning into an English kebab-case slug."
      : "Summarize the user detail into an English kebab-case slug.";
  const prefixRule = prefix
    ? `The configured branch prefix is "${prefix}". Return either only the slug, or the full name starting with that exact prefix once.`
    : "There is no configured prefix. Return only the slug.";

  return [
    "You generate a short Git branch name from a brief user description and optional attached PRD/document excerpts.",
    languageHint,
    prefixRule,
    "Prefer the concrete product/feature intent from the detail and attachments; ignore boilerplate templates, TOC, and unrelated legal text.",
    "Output exactly one line and nothing else: no quotes, no code fences, no explanation.",
    "Slug rules: lowercase ASCII letters, digits, and hyphens only; kebab-case; no spaces; no Chinese; no underscores; no consecutive hyphens; do not start or end with a hyphen.",
    "Keep the slug concise (about 2–6 words). Do not add feat/fix/chore type segments.",
    "Never invent ticket IDs unless the user detail or attachments clearly include them.",
  ].join(" ");
}
