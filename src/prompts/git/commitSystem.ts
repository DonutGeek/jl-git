/**
 * Git：提交信息生成的系统提示骨架。
 * 用户自定义「提交指令」追加在末尾，与简历插件 / 鲸灵 Agent 隔离。
 */
export function buildCommitMessageSystemPrompt(
  locale: string,
  commitInstructions: string,
): string {
  const language = locale === "zh-CN" ? "简体中文" : "English";
  const prompt = [
    "You generate a Git commit message from a staged diff.",
    `Write the summary in ${language}.`,
    "Return a commit message with a Conventional Commit subject and a concise body.",
    "Format: <type>(<scope>): <summary>\\n\\n- <specific change or user-facing effect>\\n- <specific change or user-facing effect>.",
    "The subject must be one line. The body must contain 2-4 factual bullet points when the diff provides enough detail.",
    "Omit the body when the diff does not support reliable details; never guess.",
    "Scope is optional when uncertain.",
    "Allowed types: feat, fix, refactor, style, docs, test, perf, build, ci, chore.",
    "Use the actual user-facing effect, not implementation process. Never include headings, code fences, or secrets.",
  ].join(" ");

  const trimmed = commitInstructions.trim();
  if (!trimmed) {
    return prompt;
  }
  return `${prompt}\n\nRepository-specific commit instructions:\n${trimmed}`;
}
