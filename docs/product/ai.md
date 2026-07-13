# AI 能力设计

> **相关文档：** [roadmap](roadmap.md) · [database](../architecture/database.md) · [security](../development/security.md) · [api](../api/git.md)

AI 是 **辅助层**，不是 Git 的替代执行器。所有副作用（commit、push、删分支）必须经现有 Git Command，并由用户确认。

目标版本：**v0.9**（见 roadmap）。本文定义产品与架构边界，便于提前留扩展点而不过早实现。

---

## 设计原则

1. **建议 ≠ 执行**：模型输出先展示，用户编辑后再提交
2. **最小上下文**：只上传完成任务所需的 diff/摘要，可截断
3. **可关闭**：`ai.enabled`；无 Key 时功能隐藏或只读说明
4. **可审计**：写入 `ai_history`（脱敏摘要）
5. **提供商可插拔**：OpenAI 兼容 API、本地模型等，经统一 `AiService`

---

## 能力列表

| 能力 | 输入 | 输出 | 用户下一步 |
|------|------|------|------------|
| **AI Commit Message** | 暂存区 diff 摘要 + 可选风格 | 标题/正文候选 | 编辑后 `git_commit` |
| **AI Diff Explain** | 单文件或提交 patch | 结构化说明 | 只读 |
| **AI Review** | 变更集 | 风险点/建议列表 | 只读；可一键复制评论 |
| **AI Branch Naming** | 变更摘要 / issue 标题 | 分支名候选 | 确认后 `git_branch_create` |
| **AI Release Notes** | 提交区间 log | 分类说明草稿 | 复制到 Release |

---

## 架构挂载

```
UI（AiPanel / Commit 旁按钮）
  → AiService
      →（可选）invoke ai_* 历史
      → Provider SDK（网络）或后续 Rust 代理
  → 用户确认
      → GitService / 其他 Service
```

```mermaid
flowchart LR
  Diff[Diff 摘要] --> AI[AiService]
  AI --> Out[建议文案]
  Out --> User[用户编辑确认]
  User --> Git[GitService.commit]
```

- **不要**把 AI 逻辑塞进 `gitService`
- **不要**让模型返回的字符串直接当 shell

---

## 上下文与隐私

| 规则 | 说明 |
|------|------|
| 截断 | 超大 diff 只送 numstat + 文件路径 + 片段 |
| 脱敏 | 检测明显密钥模式并拒绝上传或遮罩 |
| 历史 | `input_summary` 存摘要，不默认存全量 patch |
| 清空 | 设置中提供清除 AI 历史 |
| 密钥 | 不进 SQLite；设置抽屉「Agent Key」经 Tauri Store（`ai-secrets.json`）；后续可迁 OS 安全存储 |

---

## 提供商配置（设置）

```ts
interface AiSettings {
  enabled: boolean;
  provider: "openai-compatible" | "none";
  baseUrl?: string;
  model?: string;
  // apiKey 不进 settings 明文表时，用安全存储 id 引用
}
```

失败：网络错误、401、超时 → toast；不阻塞 Git 主路径。

---

## UX 要点

- Commit 区：「生成建议」按钮；生成中可取消
- 建议结果可多候选切换
- Review 结果用列表 + 严重级别，避免墙式散文
- 全员文案走 i18n；模型输出保持原语言或按设置请求语言

---

## 非目标（v0.9）

- 自主连续执行多步 Git（agent 自动 push）
- 在未审阅情况下修改工作区文件
- 训练/上传用户私有模型到不明服务

---

## 成功标准

- 无 AI Key 时应用完整可用
- 有 AI 时，Commit Message 建议在典型变更下可减少手工写作时间
- 安全审查：无密钥进日志/历史；无直接执行模型返回命令
