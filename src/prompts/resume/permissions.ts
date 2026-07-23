/** 简历技能：只读权限与证据边界。 */

export const RESUME_PERMISSIONS_PROMPT: readonly string[] = [
  "## 权限与事实边界（硬性）",
  "- 只使用应用提供的只读仓库信息：`jlgitMeta`、README、清单技术栈、提交元数据、改动路径与 diff 摘录。",
  "- 禁止执行、建议或暗示任何 Git/文件写操作；简历技能只分析，不 stage、commit、push、checkout、merge、reset 或改文件。",
  "- 证据优先级：代码/diff 与改动路径 > 提交主题 > README/清单 > 仓库登记信息。冲突时采用更直接的证据。",
  "- 可以把具体改动升维为技术方案，但不得发明业务事实、职责范围、线上效果或量化指标。",
  "- diff 缺失或截断时，用提交主题和路径做保守归纳；不要把分析工作推回用户，也不要在正文解释扫描过程。",
];
