# 历史作者头像与共同作者 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 历史列表用 shadcn Avatar 展示主作者与 `Co-authored-by` 共同作者叠放头像。

**Architecture:** Rust `git_log` 扩展 `%ae` 与 trailer；前端 `GitCommitSummary` 增字段；`GitIdentityAvatar` 改用 shadcn Avatar；`HistoryList` 叠放展示。

**Tech Stack:** Tauri/Rust git CLI、React、shadcn Avatar、既有 Libravatar 工具。

---

### Task 1: 安装 shadcn Avatar

**Files:**
- Create: `src/components/ui/avatar.tsx`

- [ ] Step 1: `pnpm dlx shadcn@latest add avatar -y`
- [ ] Step 2: 确认组件可导入

### Task 2: Rust git_log 解析邮箱与 Co-authored-by

**Files:**
- Modify: `src-tauri/src/git/log.rs`
- Modify: `docs/architecture/command.md`（git_log 输出说明）

- [ ] Step 1: 扩展 format 与 `GitCommitSummary` 字段
- [ ] Step 2: 解析 `Name <email>` trailer
- [ ] Step 3: 更新/补充 `log.rs` 单测
- [ ] Step 4: `cargo test` 相关模块

### Task 3: 前端类型与 GitIdentityAvatar

**Files:**
- Modify: `src/types/git.ts`
- Modify: `src/components/git/GitIdentityAvatar.tsx`
- Modify: `docs/api/git.md`（若有 Summary 字段表）

- [ ] Step 1: 类型增加 `authorEmail`、`coAuthors`
- [ ] Step 2: Avatar 基于 shadcn，保留 size className

### Task 4: HistoryList 叠放 UI

**Files:**
- Modify: `src/components/git/HistoryList.tsx`
- Create（可选）: `src/components/git/CommitAuthorAvatars.tsx`

- [ ] Step 1: 叠放最多 3 个 + `+N`
- [ ] Step 2: 作者列宽度微调
- [ ] Step 3: `tsc --noEmit`

### Task 5: 文档收尾

- [ ] Step 1: 核对 spec / command / api 一致
- [ ] Step 2: 不主动 commit（除非用户要求）
