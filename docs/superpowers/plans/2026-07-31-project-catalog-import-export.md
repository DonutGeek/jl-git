# 仓库登记清单导入 / 导出 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在仓库管理工具栏支持 JSON 清单的导入 / 导出（元数据 + 分组，不含 Git 本体）。

**Architecture:** 纯前端组装/解析 JSON + 现有 `projectService` / `workspaceService`；文件读写走 `system_write_text_file` / 新增 `system_read_text_file`；筛选导出使用 Panel 已应用筛选后的全量列表。

**Tech Stack:** Tauri 2 Command、React、Zustand store、shadcn Dialog/Checkbox/Table/ScrollArea、i18n。

## Global Constraints

- 遵守 `AGENTS.md`：经 Service、`pnpm check`、不手改 `src/components/ui/**`
- 规格：`docs/superpowers/specs/2026-07-31-project-catalog-import-export-design.md`（含 1–5 补丁：忽略 pinned/sortOrder；同父同名→全局唯一同名→id；checkUniqueness 抛错判无效；无远程附注；locked 用 create+update）
- 文案 key 前缀：`projectManager.catalog*`
- 读文件上限：2 MiB

---

### Task 1: `system_read_text_file` + 前端读写封装

**Files:**
- Modify: `src-tauri/src/system.rs`（对称 `write_text_file`）
- Modify: `src-tauri/src/commands/system.rs`、`src-tauri/src/lib.rs`
- Modify: `src/services/system/system.write.ts` 或新建 `system.textFile.ts`
- Modify: `docs/architecture/command.md`

- [x] 实现读绝对路径文本，超限返回 `VALIDATION`
- [x] 前端 `readTextFile` + `importTextFile`（`open` 对话框 + 读取）
- [x] 文档补一行命令表

### Task 2: 纯函数 `projectCatalog` utils

**Files:**
- Create: `src/utils/projectCatalog.ts`
- Create: `src/types/projectCatalog.ts`（可选，或放 utils 旁）

- [x] `parseCatalogJson` / schema+version 校验
- [x] `topoSortWorkspaces`（环/缺父失败）
- [x] `collectAncestorWorkspaces(projects, allWorkspaces)`
- [x] `buildCatalogDocument` / `matchLocalWorkspace`（同父同名 → 全局唯一同名 → id）
- [x] `clipCatalogForProjects`

### Task 3: `project.catalog` Service

**Files:**
- Create: `src/services/project/project.catalog.ts`
- Modify: `src/services/project/index.ts`
- Modify: `docs/api/project.md`

- [x] `buildExportPayload` / `exportCatalog`
- [x] `buildImportPreview`（checkUniqueness；INVALID_PATH/NOT_A_REPO → invalid）
- [x] `executeImport`（分组映射 + create/update；忽略 pinned/sortOrder）

### Task 4: UI 对话框 + 工具栏

**Files:**
- Create: `ProjectCatalogExportDialog.tsx`、`ProjectCatalogImportPreviewDialog.tsx`
- Modify: `ProjectManageToolbar.tsx`、`ProjectManagePanel.tsx`
- Modify: `zh-CN` / `en` `projectManager.json`
- Modify: `docs/product/feature-list.md`

- [x] 导出：全部 checkbox + 摘要 + exportTextFile
- [x] 导入：选文件 → 预览勾选 → 执行 → toast + `loadProjects`/`loadWorkspaces`
- [x] Toolbar 接收 `filteredProjects`；导入导出按钮

### Task 5: 自检

- [x] `pnpm check`
- [ ] 冒烟：导出全量/筛选；导入新增/更新/无效不可勾选（需本机 UI）
