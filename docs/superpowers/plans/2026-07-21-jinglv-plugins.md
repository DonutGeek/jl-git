# 鲸履插件壳 Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 鲸履左栏上插件下会话；内置「简历」；`@`/自然语言点名项目成稿；去掉 Composer chip。

**Architecture:** 轻量 `JinglvPlugin` 注册表；扩展 `AgentComposer` mention kind；发送时解析 mentions + 文案；串行「全部」改由关键词触发。

**Tech Stack:** React、react-mentions-ts、现有 jinglv store/prompts、i18n。

## Global Constraints

- 不做插件市场 / 二次 LLM 路由
- UI 文案走 i18n；禁 `any`
- 只读 Git；路径不进 prompt

---

## Task 1: 类型 + 注册表

- [x] `src/types/ai.ts`：`AgentMention` 联合类型（branch | plugin | project）
- [x] `src/plugins/jinglv/registry.ts`：内置 resume 插件
- [x] 导出 mention 显示名工具

## Task 2: AgentComposer 分组提及

- [x] `AgentMentionOption` 增加 `kind` + 分组
- [x] 映射 mentions 时保留 kind
- [x] 分组标题：插件 / 项目 / 本地 / 远端
- [x] 鲸灵 `AgentChatPanel` 仍传 branch kind

## Task 3: 侧栏插件区

- [x] `JinglvConversationSidebar` 上区插件列表
- [x] 点击回调 `onInsertPluginMention(plugin)`
- [x] i18n

## Task 4: Workspace 接线

- [x] 去掉 topAccessory chips
- [x] 传入 plugin+project mentionOptions
- [x] 发送带 mentions；`resolveTargetProfiles` 支持 mention ids + 「全部」关键词 → sequential
- [x] 更新 greeting / placeholder

## Task 5: 文档与自检

- [x] 更新 `docs/product/ai.md` / feature-list 一行
- [x] `pnpm exec tsc --noEmit`
