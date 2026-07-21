# Changelog

本文件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

发布节奏与版本切片见 [docs/product/roadmap.md](docs/product/roadmap.md) 与 [docs/product/releases.md](docs/product/releases.md)。

## [Unreleased]

### Added

- 完整文档体系：`AGENTS.md`、`README.md`、`CONTRIBUTING.md`、`docs/**`
- Tauri 2 + React + TypeScript 项目脚手架
- 预置插件：SQL（SQLite）、Store、Dialog、FS、Notification、Updater、Clipboard、Log、Opener
- DeepSeek 提交文案建议：基于暂存区 Diff 生成 Conventional Commit 信息，用户确认后提交
- 可配置的 AI Git 指令：提交指令已用于提交文案生成，拉取请求指令为后续 PR 文案生成保留
- DeepSeek API Key 列表：支持创建、启用/禁用、删除与脱敏展示
- 应用线上升级：GitHub Releases + 状态栏「更新」检查/下载/验签/重启

### Changed

- 无

### Fixed

- 无

### Security

- 无

## [0.1.0] - 2026-07-09

### Added

- 初始仓库与桌面应用壳（Tauri 2）
- Vite + React 19 + TypeScript 前端入口
- Tailwind CSS 4 + shadcn/ui 基础组件（Button）

[Unreleased]: https://github.com/jingling/JLGit/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/jingling/JLGit/releases/tag/v0.1.0
