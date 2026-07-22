# Settings Preference Rows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 设置抽屉内开关/下拉/分段偏好行改为左文右控分组卡片；表格与路径 Input 不动；编辑器主题下期。

**Architecture:** 领域组件 `SettingsPreferenceGroup` + `SettingsPreferenceRow`（`components/settings/`），组合 shadcn `Label`；`SettingsDrawer` 按分区迁移。

**Tech Stack:** React、Tailwind tokens、`@/components/ui/label`、现有 `Switch` / `SelectMenu` / `SegmentedControl`

**Spec:** [docs/superpowers/specs/2026-07-22-settings-preference-rows-design.md](../specs/2026-07-22-settings-preference-rows-design.md)

---

### File map

| File | Responsibility |
|------|----------------|
| `src/components/settings/SettingsPreferenceGroup.tsx` | 圆角卡片容器 |
| `src/components/settings/SettingsPreferenceRow.tsx` | 左文右控一行 |
| `src/components/settings/SettingsDrawer.tsx` | 迁移外观/Git开关/工具Select/通用 |

---

### Task 1: 落地 Group / Row 组件

- [x] 创建两文件；Group：`rounded-md border bg-card overflow-hidden`（项目圆角）；Row：`flex` + `Label` + description + children；`last` 行无底边
- [x] 目视：单独 import 无类型错误

### Task 2: 迁移 SettingsDrawer 偏好行

- [x] 外观四行进一个或两个 Group
- [x] Git「提交后推送」改 Row+Switch
- [x] 工具：编辑器/终端 Select 进 Group；路径 Input 仍竖排在 Group 下
- [x] 通用：开机自启 + 启动标签
- [x] 清理无用 `Item`/`ItemGroup` import（若本文件不再用）
- [x] `pnpm exec tsc --noEmit`；设置各分区冒烟

### Task 3: 收尾

- [x] Spec 状态改为已实现（可选一句）
- [x] 不提交（除非用户要求）
