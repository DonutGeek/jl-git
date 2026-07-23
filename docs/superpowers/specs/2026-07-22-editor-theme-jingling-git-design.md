# 应用主题（鲸灵 Git 等）

> 日期：2026-07-22  
> 状态：已实现（由「编辑器主题」扩展为整站主题包）  
> 前置：设置偏好行布局已完成

## 目标

设置 → 外观提供 **应用主题**（整站 Design Tokens + Monaco Diff/文件视图）。编辑器只是主题的一部分。当前内置 **鲸灵 Git、GitHub、ChatGPT、Claude、Codex、VS Code**。

## 约定

| 项 | 内容 |
|----|------|
| 偏好键 | `appThemeId`（兼容旧 `editorThemeId`），默认 `jingling-git` |
| 色板 | `themeChromeLight` / `themeChromeDark`：背景、卡片/弹层、次要区、侧栏、选中态、Diff、Git 状态色、侧栏透明度与对比度 |
| 切换主题包 | `setAppThemeId` **自动套用**该包明暗预设色（覆盖当前自定义） |
| 昼夜 | 仍跟 `html.dark`；切换昼夜时应用对应 chrome 到 document |
| UI | 纯文字主题下拉 + 应用内 HEX 色板 + 完整语义色 + 半透明侧栏 + 对比度滑条；修改自动保存 |
| 代码 | `src/design/editor-themes.ts` → `applyAppThemeToDocument` / `applyAppMonacoTheme` |

## 不做

- Diff 工具栏独立主题
- 导入/导出主题文件
- 自定义语法 token rules（仍 inherit Monaco base）
