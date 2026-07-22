# 官方三端 Implementation Plan

> **For agentic workers:** Use executing-plans or implement inline. Checkbox steps for tracking.

**Goal:** mac / Win / Linux 官方发版 + updater；平台 conf 三分；Linux AppImage x86_64；顺带 Win 磁盘与文案。

**Architecture:** `tauri.{macos,windows,linux}.conf.json` 拆装饰；CI matrix 三端；前端自绘三键覆盖 Win+Linux。

## Tasks

### Task 1: 平台 conf 三分 — Done
- `tauri.conf.json` 去 Overlay / decorations
- 新建 `tauri.macos.conf.json` / 更新 windows / 新建 linux

### Task 2: 前端 chrome 覆盖 Linux — Done
- `needsCustomChromeControls`、子窗 options、hook

### Task 3: CI Linux AppImage — Done
- `publish-desktop.yml` ubuntu-22.04 + apt deps + `--bundles appimage`

### Task 4: 系统能力 / 菜单 / 文案 — Done
- Win 磁盘空间 PowerShell
- 菜单 mac vs desktop
- 打开目录文案按 OS

### Task 5: 文档 — Done
- design spec、releases 矩阵、tauri.md、ui-guidelines、feature-list

### Task 6: 验证
- [ ] `tsc --noEmit`
- [ ] mac `tauri dev` Overlay 回归
- [ ] 下次 tag 确认 `latest.json` 含三键
