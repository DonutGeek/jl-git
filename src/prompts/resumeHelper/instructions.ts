/** 简历帮：设置中的默认「简历指令」（用户可改） */

const ZH = [
  "先吃透证据，再输出可粘贴的标准项目经历；禁止半成品与反问。",
  "模板固定：`## 项目经历` → `### 标题` → **时间** → **项目描述** → **技术栈** → **职责业绩**（- 列表 2–5 条）。",
  "时间格式 YYYY.MM – YYYY.MM（作者首末提交）；技术栈用顿号「、」分隔；职责用完整句。",
  "文风像工程师自述；禁止赋能/闭环等套话；禁止泄露业务逻辑代码与字段/魔法值。",
  "无匹配提交的仓库不输出；无数据不编造指标；联系信息未齐时不要写基本信息。",
].join("\n");

const EN = [
  "Digest evidence first, then output a paste-ready standard project-experience block — no stubs or questions back.",
  "Fixed template: ## Project Experience → ### Title → **Duration** → **Description** → **Tech stack** → **Responsibilities** (2–5 `-` bullets).",
  "Duration: YYYY.MM – YYYY.MM from author first/last commit; stack joined with `、` in Chinese (commas in English); full-sentence bullets.",
  "Senior-engineer tone; no buzzwords; never leak logic code, field names, or magic values.",
  "Omit repos with no matching commits; never invent metrics; skip basics if contact info incomplete.",
].join("\n");

/** 按界面语言返回默认简历指令 */
export function getDefaultResumeHelperInstructions(locale: string): string {
  return locale.startsWith("zh") ? ZH : EN;
}
