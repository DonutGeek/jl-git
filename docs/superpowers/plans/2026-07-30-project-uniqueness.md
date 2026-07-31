# 项目唯一性 Implementation Plan

**Goal:** 本地路径重复拒绝覆盖并提示打开已有；远程身份克隆前提示 warn-continue。

**Architecture:** Rust 统一路径/远程规范化与检查；`project_add` 冲突返回已有项目；前端共享弹窗挂接打开/克隆入口。

## Tasks

1. [x] Rust remote identity + uniqueness check + add_project 拒覆盖
2. [x] FE service/types + 共享弹窗
3. [x] 挂接 OpenRepoDialog / ProjectManager / CloneRepoPanel
4. [x] i18n + docs + verify（`pnpm check` / `cargo check` / remote_identity 单测通过）
