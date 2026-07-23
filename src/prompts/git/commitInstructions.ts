/** Git：提交信息生成 — 设置中的默认「提交指令」（固定中文，不跟界面语言切换） */

const DEFAULT = [
  "使用 Conventional Commits：feat|fix|refactor|style|docs|test|perf|build|ci|chore(scope): summary。",
  "subject 一行说清变更结果；信息充足时 body 用 2–4 条要点写用户可感知影响，勿猜测。",
  "优先写「做了什么 / 为何」，避免过程流水账；不要输出密钥、token 或大段无关路径罗列。",
  "文案语言与仓库近期提交习惯一致（中文仓库用中文）。",
].join("\n");

/** 旧版按 en 界面注入的默认稿；读盘时若全等则视为未自定义，回退中文默认 */
export const LEGACY_EN_COMMIT_INSTRUCTIONS = [
  "Use Conventional Commits: feat|fix|refactor|style|docs|test|perf|build|ci|chore(scope): summary.",
  "Keep the subject to one line describing the outcome; when the diff supports it, add 2–4 factual body bullets about user-facing impact — never guess.",
  "Prefer what/why over process narration; never include secrets, tokens, or long irrelevant path dumps.",
  "Match the language of recent commits in the repository.",
].join("\n");

export function getDefaultCommitInstructions(): string {
  return DEFAULT;
}
