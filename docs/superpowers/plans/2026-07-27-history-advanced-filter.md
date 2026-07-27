# History Advanced Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 历史页高级筛选从占位变为可用：Popover 配置 grep/路径/日期/Git 作者/合并提交，经扩展 `git_log` 重拉历史；工具栏前端过滤保持叠加。

**Architecture:** Rust `git_log` 增加可选 argv；前端 `GitLogOptions` + store `historyAdvanced`；`HistoryAdvancedFilterPopover` 写 applied 并触发 reload；`HistoryList` 工具栏过滤逻辑不变。

**Tech Stack:** Tauri 2 / Rust git CLI、React、Zustand、shadcn Popover/Field/Input/Switch、i18next

**Spec:** [docs/superpowers/specs/2026-07-27-history-advanced-filter-design.md](../specs/2026-07-27-history-advanced-filter-design.md)

## Global Constraints

- UI 永不直连 invoke；经 Service
- 禁止 shell 拼接；Git 参数数组化
- 禁止手写/私改 `src/components/ui/`
- 文案走 i18n；注释中文
- 合并开关与 `showMergeCommits` viewPrefs 同步

## File Map

| 文件 | 职责 |
|------|------|
| `src-tauri/src/git/log.rs` + command 入参 | grep/since/until/no_merges |
| `src/types/git.ts` | `GitLogOptions` 字段 |
| `src/services/git/git.log.ts` | 透传 + `buildHistoryLogOptions` |
| `src/utils/historyAdvancedFilters.ts` | 空态/校验/转 GitLog 片段/转义 author |
| `src/store/useRepoStore.ts` | `historyAdvanced` 状态与 reload |
| `src/components/git/HistoryAdvancedFilterPopover.tsx` | Popover UI |
| `src/components/git/HistoryList.tsx` | 接入入口 |
| `src/i18n/locales/*/repo.json` | 文案 |
| `docs/architecture/command.md` / `docs/api/git.md` | 契约 |

---

### Task 1: Rust + 类型 + Service

**Files:** `src-tauri/src/git/log.rs`, command 定义, `src/types/git.ts`, `src/services/git/git.log.ts`, docs

- [x] 扩展 `git_log` 可选 `grep` / `since` / `until` / `no_merges`，校验长度与禁换行
- [x] 单元测试：拼装参数；非法 grep 拒绝
- [x] TS `GitLogOptions` + `getLog` / `buildHistoryLogOptions` 透传
- [x] 更新 command.md / api/git.md

### Task 2: 筛选工具 + Store

**Files:** `src/utils/historyAdvancedFilters.ts`, `useRepoStore.ts`

- [x] `HistoryAdvancedFilters`、`EMPTY`、`hasActiveAdvanced`、`toLogOptions`、`isDateRangeInvalid`、author 转义
- [x] store 增加 `historyAdvanced`；`applyHistoryAdvanced` / `clearHistoryAdvanced`
- [x] 所有 `getLog`/`loadMore`/`selectLogRef` 路径带上 advanced
- [x] 切仓 `reset`/open 时清空 advanced

### Task 3: Popover UI + HistoryList

**Files:** `HistoryAdvancedFilterPopover.tsx`, `HistoryList.tsx`, i18n

- [x] Popover：五字段 + 重置/应用；日期校验
- [x] 替换滑块 coming-soon；有 applied 时高亮
- [x] 应用写入 prefs `showMergeCommits` 并 reload log
- [x] zh-CN / en 文案

### Task 4: 自检

- [x] `tsc` / 相关测试
- [ ] 冒烟路径：应用 grep、重置、工具栏搜索仍叠加
