# 历史详情分支/大小 Implementation Plan

> **For agentic workers:** 可按任务顺序实现；本功能体量小，可单会话落地。

**Goal:** 历史详情「显示分支 / 显示大小」点击后展示真实数据。

**Architecture:** 懒加载两个 Tauri Command；UI 点一次后替换按钮为文案行。

**Tech Stack:** Tauri 2 + React + git CLI

---

### Task 1: Rust `show.rs` + commands

- [ ] `containing_branches` / `change_size`
- [ ] 注册 `git_commit_containing_branches`、`git_commit_change_size`
- [ ] 更新 `command.md` / `api/git.md`

### Task 2: Frontend service + UI

- [ ] types + `git.show.ts` + `gitService`
- [ ] `HistoryDetailPane` 交互与 i18n
- [ ] `tsc` + 相关冒烟
