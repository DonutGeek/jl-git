/** 简历插件：内置默认「简历指令」（固定中文；开发侧维护；设置里不再暴露编辑入口） */

const DEFAULT = [
  "先吃透证据，再输出可粘贴的标准项目经历；禁止半成品与反问。",
  "模板固定：`## 项目经历` → `### 标题` → **时间** → **项目描述** → **技术栈** → **职责业绩**（- 列表 2–5 条）。",
  "时间格式 YYYY.MM – YYYY.MM（作者首末提交）；技术栈用顿号「、」分隔；职责用完整句。",
  "文风像工程师自述；禁止赋能/闭环等套话；禁止泄露业务逻辑代码与字段/魔法值。",
  "列举项目时列出全部已登记仓库；成稿勿编造无证据的经历；无数据不编造指标；只写项目经历，不要基本信息/联系方式。",
].join("\n");

/** 旧版按 en 界面注入的默认稿；读盘时若全等则视为未自定义，回退中文默认 */
export const LEGACY_EN_RESUME_INSTRUCTIONS = [
  "Digest evidence first, then output a paste-ready standard project-experience block — no stubs or questions back.",
  "Fixed template: ## Project Experience → ### Title → **Duration** → **Description** → **Tech stack** → **Responsibilities** (2–5 `-` bullets).",
  "Duration: YYYY.MM – YYYY.MM from author first/last commit; stack joined with `、` in Chinese (commas in English); full-sentence bullets.",
  "Senior-engineer tone; no buzzwords; never leak logic code, field names, or magic values.",
  "When listing projects, include every registered repo; never invent experience without evidence; project experience only — no contact/basics.",
].join("\n");

export function getDefaultResumeInstructions(): string {
  return DEFAULT;
}
