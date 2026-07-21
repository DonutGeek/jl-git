/** 简历插件联系信息（Git 账号复用设置 → Git 公共列表） */
export interface AgentIdentity {
  /** 简历展示姓名 */
  displayName: string;
  phone: string;
  /** 联系邮箱（可与 Git 邮箱不同） */
  email: string;
}

/**
 * 鲸灵Git 登记信息（打开/管理仓库时用户填写）。
 * 注入模型上下文；后续可扩展 description 等字段，序列化层按非空输出即可。
 */
export interface AgentJlgitMeta {
  /** 仓库绝对路径 */
  path: string;
  /** 仓库别名（应用内展示名） */
  alias: string;
  /** 仓库分组名；未分组为 null */
  groupName: string | null;
}

/** 单仓画像（只读汇总，注入多仓鲸灵 Agent 上下文） */
export interface AgentProjectProfile {
  projectId: string;
  projectName: string;
  /** 仓库绝对路径：前端拉证据用；模型侧请读 jlgitMeta.path */
  projectPath?: string;
  /** 鲸灵Git 登记信息（路径 / 别名 / 分组；可扩展） */
  jlgitMeta: AgentJlgitMeta;
  /** 是否汇总失败 */
  error?: string;
  /** 作者参与：最早提交（接手）ISO 时间 */
  firstCommitAt: string | null;
  /** 作者参与：最晚提交 ISO 时间 */
  lastCommitAt: string | null;
  sampledCommitCount: number;
  /**
   * 写入简历的技术栈：优先 package.json 主栈 ∩ 该作者使用证据；
   * 无 package.json 时由改动路径/代码推断。
   */
  techStackHints: string[];
  /** package.json 解析出的候选主栈（未按作者过滤） */
  packageTechStack?: string[];
  /** 命中的 README 相对路径（若有） */
  readmePath?: string;
  /** README 摘录（截断），供判断项目名/简介是否可用 */
  readmeExcerpt?: string;
  /** 抽样提交（可按作者再过滤后重算） */
  recentCommits: ResumeCommitSample[];
}

/** 提交内改动文件的只读摘要（含可选 diff 摘录） */
export interface ResumeCommitChangedFile {
  path: string;
  status: string;
  additions?: number | null;
  deletions?: number | null;
  /** 代码/补丁摘录，已截断脱敏前原文 */
  snippet?: string;
}

export interface ResumeCommitSample {
  /** 完整 commit id，供只读拉取 diff */
  id: string;
  shortId: string;
  subject: string;
  authorName: string;
  authorEmail: string;
  authoredAt: string;
  /** 只读查询得到的改动文件与代码摘录 */
  changedFiles?: ResumeCommitChangedFile[];
}
