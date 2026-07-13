# 操作日志（Git Op Log）设计

> 日期：2026-07-10 · 方案 A（已确认）

## 目标

状态栏右侧按钮打开当前仓库的 Git 操作日志面板；可展开查看底层命令明细；按钮图标反映最近一次操作成败，无记录时用默认图标。

## 架构

```
Rust OpSpan(commit/fetch/push)
  → runner 每次 git 调用 emit jlgit://git-op
  → 前端 useOpLogStore 按 repoPath 聚合
  → StatusBar 图标 + OpLogPanel
```

- 会话内存，每仓库最多 50 条
- 首批：提交 / 检查更新 / 推送
- 不记录凭据与 commit message 正文（`-F -` 仅记命令名）
