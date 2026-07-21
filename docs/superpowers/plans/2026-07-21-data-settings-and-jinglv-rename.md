# 设置「数据」+ 鲸履更名 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 设置新增「数据」分类（路径/打开/按模块清理/完整备份导入导出），并将用户可见「简历帮」更名为「鲸履」。

**Architecture:** UI → `DataService` → `app_data_*` Tauri commands → Rust（路径、清理 SQLite/Store 文件、zip 备份）。localStorage 由前端采集/应用；导入 DB 经 `jlgit.db.pending` + 重启后替换。

**Tech Stack:** Tauri 2、sqlx、zip crate、plugin-dialog、Zustand、i18next、现有 SettingsDrawer。

## Global Constraints

- 用户可见名：鲸履（zh）/ Jinglü（en）；代码 id 仍 `jinglv`
- 「全部清理」不含 projects/workspaces/recent
- UI 不直连 `invoke`；禁止 `any`；文案走 i18n
- 备份含密钥，UI 必须提示妥善保管
- 自定义 DB 路径不做

## File map

| 路径 | 职责 |
|------|------|
| `src-tauri/src/db/app_data.rs` | 清理 chat scope、VACUUM INTO、pending DB 应用 |
| `src-tauri/src/commands/app_data.rs` | `app_data_paths/reveal/clear/export/import` |
| `src/services/data/data.service.ts` | 前端门面 + localStorage 约定键 |
| `src/components/settings/SettingsDataSection.tsx` | 数据分类 UI（可内联进 Drawer 若更简） |
| `src/i18n/locales/*/settings.json` + `jinglv.json` | 文案 |
| docs: command.md / database.md / feature-list / ai | 文档 |

---

### Task 1: 鲸履文案更名

**Files:** `src/i18n/locales/zh-CN/jinglv.json`, `en/jinglv.json`, `zh-CN/settings.json`（Git hint 等含「简历帮」处）, 产品文档中用户称呼

- [ ] 将用户可见「简历帮」→「鲸履」；en →「Jinglü」
- [ ] `rg '简历帮'` 确认 zh 产品文案无残留（文档/注释可保留历史）
- [ ] Commit: `docs(i18n): 简历帮更名为鲸履`

### Task 2: Rust paths + reveal + clear（DB/Store）

**Files:** Create `src-tauri/src/db/app_data.rs`, `src-tauri/src/commands/app_data.rs`; wire `mod`/`lib.rs`; add `zip` dep when needed in Task 4

- [ ] `app_data_paths` → `{ appDataDir, databasePath }`
- [ ] `app_data_reveal` → dir 用现有 `system::reveal_in_file_manager`；database 用平台 reveal 文件（macOS `open -R`）
- [ ] `app_data_clear(module)`：agent/resume chats SQL；store 文件 reset；`ui_prefs`/`open_tabs` Rust 侧 no-op（FE 清）
- [ ] setup：若存在 `jlgit.db.pending`，连接前原子替换 `jlgit.db`
- [ ] `cargo check`

### Task 3: DataService + 设置「数据」壳 + paths/reveal UI

**Files:** `src/services/data/data.service.ts`, SettingsDrawer, settings i18n

- [ ] Service：`getPaths`, `reveal`, `clear`, 以及 localStorage 采集/应用 helpers
- [ ] 新分类 `data`，顺序：tools → jinglv → data → general
- [ ] 展示路径、复制、打开目录/数据库
- [ ] `tsc --noEmit`

### Task 4: 清理 UI + 确认 + 前端副作用

- [ ] 8 个模块行 + Dialog 确认（all 更强文案）
- [ ] clear 后：agent store `clearProject`/整表清空逻辑、resume hydrate 清空、reload AI/git/resume stores、清 localStorage
- [ ] 冒烟：清鲸灵对话后 projects 仍在

### Task 5: 导出/导入 zip

- [ ] Cargo 加 `zip`
- [ ] export：VACUUM INTO 临时 db + stores + FE 传入 localStorage → zip
- [ ] import：校验 manifest → 写 stores → `jlgit.db.pending` → 返回 localStorage → FE 应用 → 提示重启（`tauri::process::restart` 若可用，否则 toast）
- [ ] UI 敏感提示 + 导入二次确认
- [ ] `cargo check` + `tsc`

### Task 6: 文档

- [ ] command.md / database.md / feature-list / ai.md 同步
- [ ] Commit

---

**Self-review:** Spec §3–§7、§11 均有对应 Task；非目标未纳入。
