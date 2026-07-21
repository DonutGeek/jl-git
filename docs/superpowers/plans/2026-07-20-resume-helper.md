# 简历帮 Implementation Plan

> **For agentic workers:** 按任务顺序实现；完成后对照设计文档验收。

**Goal:** 设置「简历帮」打开单例子窗，扫描全部已登记仓库画像，对话产出 Markdown 简历。

**Architecture:** Settings → `openJinglvWindow` → `/jinglv` → Workspace（复用 Agent 消息 UI）→ `buildJinglvProfiles`（前端调现有 git_log/listTree）→ `streamJinglvReply`（独立 prompt + 鲸灵 Key）。

## 任务

1. [x] 子窗 service / capability / route / page
2. [x] types + profile service + store
3. [x] prompts + `ai.resume.ts`
4. [x] JinglvWorkspace UI
5. [x] Settings 入口 + i18n + command/feature 文档短更
