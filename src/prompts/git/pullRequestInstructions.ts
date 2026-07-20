/** Git：拉取请求生成 — 设置中的默认「拉取请求指令」 */

const ZH = [
  "标题简短，优先 Conventional Commits 风格（如 feat(scope): …）。",
  "描述使用 Markdown，建议包含：Summary（1–3 点）与 Test plan（可勾选清单）。",
  "写清动机与影响范围；不要粘贴大段 diff，不要包含密钥或凭据。",
].join("\n");

const EN = [
  "Keep the title short; prefer Conventional Commits style (e.g. feat(scope): …).",
  "Write the description in Markdown with Summary (1–3 bullets) and a Test plan checklist.",
  "State motivation and impact; do not paste large diffs or include secrets/credentials.",
].join("\n");

/** 按界面语言返回默认 PR 指令 */
export function getDefaultPullRequestInstructions(locale: string): string {
  return locale.startsWith("zh") ? ZH : EN;
}
