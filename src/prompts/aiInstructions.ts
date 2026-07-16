import type { AiInstructions } from "@/services/ai/ai.settings";

/**
 * JLGit 内置的 AI 提交 / PR 指令默认值。
 * 用户未自定义时使用；有团队规范可在设置中自行修改。
 */

const DEFAULT_COMMIT_INSTRUCTIONS_ZH = [
  "使用 Conventional Commits：feat|fix|refactor|style|docs|test|perf|build|ci|chore(scope): summary。",
  "subject 一行说清变更结果；信息充足时 body 用 2–4 条要点写用户可感知影响，勿猜测。",
  "优先写「做了什么 / 为何」，避免过程流水账；不要输出密钥、token 或大段无关路径罗列。",
  "文案语言与仓库近期提交习惯一致（中文仓库用中文）。",
].join("\n");

const DEFAULT_COMMIT_INSTRUCTIONS_EN = [
  "Use Conventional Commits: feat|fix|refactor|style|docs|test|perf|build|ci|chore(scope): summary.",
  "Keep the subject to one line describing the outcome; when the diff supports it, add 2–4 factual body bullets about user-facing impact — never guess.",
  "Prefer what/why over process narration; never include secrets, tokens, or long irrelevant path dumps.",
  "Match the language of recent commits in the repository.",
].join("\n");

const DEFAULT_PULL_REQUEST_INSTRUCTIONS_ZH = [
  "标题简短，优先 Conventional Commits 风格（如 feat(scope): …）。",
  "描述使用 Markdown，建议包含：Summary（1–3 点）与 Test plan（可勾选清单）。",
  "写清动机与影响范围；不要粘贴大段 diff，不要包含密钥或凭据。",
].join("\n");

const DEFAULT_PULL_REQUEST_INSTRUCTIONS_EN = [
  "Keep the title short; prefer Conventional Commits style (e.g. feat(scope): …).",
  "Write the description in Markdown with Summary (1–3 bullets) and a Test plan checklist.",
  "State motivation and impact; do not paste large diffs or include secrets/credentials.",
].join("\n");

/** 按界面语言返回软件默认 AI 指令 */
export function getDefaultAiInstructions(locale: string): AiInstructions {
  const useZh = locale.startsWith("zh");
  return {
    commit: useZh ? DEFAULT_COMMIT_INSTRUCTIONS_ZH : DEFAULT_COMMIT_INSTRUCTIONS_EN,
    pullRequest: useZh
      ? DEFAULT_PULL_REQUEST_INSTRUCTIONS_ZH
      : DEFAULT_PULL_REQUEST_INSTRUCTIONS_EN,
  };
}
