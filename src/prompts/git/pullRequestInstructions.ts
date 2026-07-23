/** Git：拉取请求生成 — 设置中的默认「拉取请求指令」（固定中文，不跟界面语言切换） */

const DEFAULT = [
  "标题简短，优先 Conventional Commits 风格（如 feat(scope): …）。",
  "描述使用 Markdown，建议包含：Summary（1–3 点）与 Test plan（可勾选清单）。",
  "写清动机与影响范围；不要粘贴大段 diff，不要包含密钥或凭据。",
].join("\n");

/** 旧版按 en 界面注入的默认稿；读盘时若全等则视为未自定义，回退中文默认 */
export const LEGACY_EN_PULL_REQUEST_INSTRUCTIONS = [
  "Keep the title short; prefer Conventional Commits style (e.g. feat(scope): …).",
  "Write the description in Markdown with Summary (1–3 bullets) and a Test plan checklist.",
  "State motivation and impact; do not paste large diffs or include secrets/credentials.",
].join("\n");

export function getDefaultPullRequestInstructions(): string {
  return DEFAULT;
}
