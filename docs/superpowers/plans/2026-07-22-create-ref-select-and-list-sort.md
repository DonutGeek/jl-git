# 创建标签/分支 Select + 侧栏排序简化 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建标签/分支弹窗基点改为无默认值的 shadcn Select；侧栏分支/标签排序仅保留按名称的升序/降序。

**Architecture:** UI 层用官方 shadcn Select 替换 Dialog 内常驻列表；prefs 类型收窄为 `nameAsc | nameDesc`；文案走 i18n。

**Tech Stack:** React、shadcn Select、i18next、现有 Zustand repo store（不改契约）

## Global Constraints

- shadcn 必须 `pnpm dlx shadcn@latest add select`，禁止手写/私改 `src/components/ui/`
- 产品文案走 i18n；注释中文
- 不改 Git Command / Service 签名
- Select 无默认值；提交需已选基点

---

### Task 1: 引入 shadcn Select + i18n

**Files:**
- Create: `src/components/ui/select.tsx`（仅 CLI）
- Modify: `src/i18n/locales/zh-CN/common.json`, `en/common.json`
- Modify: `src/i18n/locales/zh-CN/repo.json`, `en/repo.json`

- [x] **Step 1:** `pnpm dlx shadcn@2.1.8 add select`（latest 因 zod/MCP 崩溃，改用可用官方版本）
- [x] **Step 2:** 增加 `common.pleaseSelect`（请选择 / Please select）
- [x] **Step 3:** 增加 `repo.sortAsc` / `repo.sortDesc`；删除旧四项排序文案

---

### Task 2: CreateTagDialog → Select

**Files:**
- Modify: `src/components/git/CreateTagDialog.tsx`

- [x] 去掉过滤框、ScrollArea 列表、PickRow/PickSection、HEAD 选项
- [x] 非 fixedRef：label + Select（本地/远端/标签分组）
- [x] 打开时 `ref = ""`；提交要求 `name` 与 `ref` 皆非空
- [x] Dialog 改为紧凑 `max-w-md`

---

### Task 3: CreateBranchDialog → Select

**Files:**
- Modify: `src/components/git/CreateBranchDialog.tsx`

- [x] 非 fixedStartPoint：Select（本地 + 远端）
- [x] 打开时 `startPoint = ""`；`canSubmit` 要求已选起点
- [x] 去掉列表过滤与 Pick 组件；紧凑布局
- [x] 固定起点路径与 checkout 勾选逻辑保持

---

### Task 4: 侧栏排序仅升序/降序

**Files:**
- Modify: `src/utils/tagListPrefs.ts`, `src/utils/branchListPrefs.ts`
- Modify: `src/components/git/TagListFilterMenu.tsx`, `BranchListFilterMenu.tsx`

- [x] `TagListSort` / `BranchListSort` = `"nameAsc" | "nameDesc"`
- [x] 读 prefs 时 `time*` 回退默认
- [x] 删除时间比较逻辑
- [x] 菜单仅两项，文案 `repo.sortAsc` / `repo.sortDesc`

---

### Task 5: 验证

- [x] `pnpm exec tsc --noEmit` 通过
- [ ] 冒烟：两 Dialog Select、侧栏排序两项（开发中手动确认）

---

**Spec coverage:** Select 无默认 / 含分支标签 / 创建分支同理 / 排序升降序按名称 / CLI select / fixed 只读 — 均有对应 Task。
