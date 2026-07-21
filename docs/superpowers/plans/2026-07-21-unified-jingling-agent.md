# 统一鲸灵 Agent Implementation Plan

> **For agentic workers:** Implement task-by-task. Checkbox tracking.

**Goal:** 同一套鲸灵 Agent；对内区分单仓鲸灵 / 多仓鲸灵；清掉「鲸履」产品名；能力渐进。

**Architecture:** `AgentHost = "project" | "global"`；共用壳与插件；会话按宿主分桶。

**Tech Stack:** React、Zustand、现有 AiService / chat SQLite、Tauri 子窗。

## Global Constraints

- 术语：单仓鲸灵 = `project`；多仓鲸灵 = `global`
- 多仓首期禁止跨仓写 Git
- 文案走 i18n；禁 `any`
- 分阶段可运行交付

---

### Task 1: 文档术语落地

**Files:**
- Modify: `docs/product/ai.md`
- Modify: `AGENTS.md`（简短术语索引）
- Already: `docs/superpowers/specs/2026-07-21-unified-jingling-agent-design.md`

- [x] 在 `ai.md` 写明单仓/多仓与会话分桶
- [x] 在 `AGENTS.md` 增加「鲸灵宿主」一行索引链到设计文档

---

### Task 2: 产品改名 + 设置并入鲸灵

**Files:**
- Modify: `src/i18n/locales/zh-CN/jinglv.json`（可改名 agent-global 文案键，或继续用 jinglv 命名空间但文案改鲸灵）
- Modify: `src/i18n/locales/en/jinglv.json`
- Modify: `src/i18n/locales/*/settings.json`（如需）
- Modify: `src/components/settings/SettingsDrawer.tsx`
- Modify: `src/services/window/jinglvWindow.ts`（窗口 title）
- Modify: `src/components/layout/StatusBar.tsx`（入口文案）
- Modify: `docs/product/feature-list.md`

- [x] 用户可见「鲸履」→「鲸灵 / 多仓鲸灵」
- [x] 去掉设置分类 `jinglv`；身份与打开按钮并入 `ai`
- [x] `tsc --noEmit` 通过

---

### Task 3: `AgentHost` 类型 + 插件目录

**Files:**
- Create: `src/types/agent-host.ts`（或写入 `src/types/ai.ts`）
- Create/Move: `src/plugins/agent/registry.ts`（从 jinglv re-export 兼容）
- Modify: 侧栏/Workspace 引用新路径

- [x] 导出 `AgentHost`（`src/types/agent-host.ts`）
- [x] 插件注册表归 `src/plugins/agent/`；`plugins/jinglv` 薄 re-export

---

### Task 4: 单仓侧栏插件入口（壳对齐）

**Files:**
- Modify: `src/components/ai/AgentChatPanel.tsx`（或抽出共享侧栏）
- 复用插件列表交互；单仓 `@` 项目可仅当前仓或暂不提供项目 mention

- [x] 单仓顶栏「插件」按钮 → Dialog 列表；可 `@简历`（无分支 @）；共用 `AgentPluginList`

---

### Task 5: 统一流式入口（薄封装）

**Files:**
- Create: `src/services/ai/ai.stream.ts`（`streamJinglingReply`）
- Modify: `AgentChatPanel` / `MultiAgentWorkspace`

- [x] `streamJinglingReply({ host })` 分发单仓 / 多仓
- [x] UI 两端改调统一 API

---

### Task 6: scope 兼容迁移（可选本迭代）

**Files:**
- Modify: `src-tauri/src/db/chat.rs`
- Modify: `src/services/ai/ai.chatPersist.ts`

- [x] 新写入 `agent_global`；读侧兼容旧 `jinglv` / `resume_helper`（schema v6）
- [x] 设置清理模块 `multi_agent_chats` / `multi_agent_identity`

---

## 执行说明

本计划按 Task 顺序落地。Task 1–3 优先；Task 4–6 可续 PR。用户已要求直接开工，采用 **Inline Execution**。
