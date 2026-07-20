/** 简历帮：设置中的默认「简历指令」（用户可改） */

const ZH = [
  "先吃透该仓全部已提供证据，再直接输出可粘贴项目简历；禁止「共 N 次提交请指定方向」这类半成品。",
  "默认只输出项目简历；联系信息未齐时不要写基本信息/待补充。",
  "高识别度项目名 + 做什么 + 技术栈 + 2–5 条有技术优势的贡献要点；简单需求不写。",
  "正文只写技术思路/技术栈，禁止业务逻辑代码、字段名、魔法值、条件表达式、接口路径。",
  "多项目必须彼此可区分；无匹配本人提交的仓库不要输出；无数据不编造指标。",
].join("\n");

const EN = [
  "Fully digest all provided repo evidence first, then deliver a paste-ready project resume — never a “N commits, tell me which direction” stub.",
  "Default to project resume only; if contact info is incomplete, never emit a basics/placeholder section.",
  "Highly recognizable titles + purpose + stack + 2–5 high-signal approach bullets; skip trivial work.",
  "Write design/approach and stack only — never leak business logic code, field names, magic numbers, conditionals, or API paths.",
  "Projects must be distinguishable; omit repos with no matching author commits; never invent metrics.",
].join("\n");

/** 按界面语言返回默认简历指令 */
export function getDefaultResumeHelperInstructions(locale: string): string {
  return locale.startsWith("zh") ? ZH : EN;
}
