/** 简历帮：设置中的默认「简历指令」（用户可改） */

const ZH = [
  "以项目经历为主：每个项目写清「做什么 / 技术栈 / 个人如何用技术解决问题」。",
  "结合提交对应的代码改动写贡献，不要只复述 commit 文案。",
  "不要写目标岗位、求职意向或空泛的自我评价；个人优势可从项目贡献中自然带出。",
  "禁止「赋能、闭环、全方位、深度参与」等空词；经历尽量：场景 + 动作 + 结果，无数据不编造。",
  "技术栈与问题/方案须有仓库画像（含 diff 摘录）或用户确认支撑；不确定时写明推测。",
].join("\n");

const EN = [
  "Focus on project experience: for each project cover purpose, tech stack, and how the author used tech to solve problems.",
  "Ground contributions in the code changes of commits — do not only paraphrase commit messages.",
  "Do not write target roles, job objectives, or vague self-praise; strengths should emerge from project contributions.",
  "Avoid empty buzzwords; prefer situation + action + result; never invent metrics.",
  "Tech and problem/solution claims must be grounded in repo profiles (including diff excerpts) or user confirmation; mark guesses clearly.",
].join("\n");

/** 按界面语言返回默认简历指令 */
export function getDefaultResumeHelperInstructions(locale: string): string {
  return locale.startsWith("zh") ? ZH : EN;
}
