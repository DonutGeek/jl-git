# 应用主题模块

> 日期：2026-07-22  
> 状态：已实现

## 目标

五套应用主题（鲸灵 Git / GitHub / Codex / Claude Code / VS Code），**模块化注册**，避免单文件膨胀。

## 目录

```
src/design/themes/
  types.ts           # id / chrome / pack 类型
  color-utils.ts     # 色运算
  packs/<name>.ts    # 单个主题：只含色板数据
  packs/index.ts     # ★ 注册表（新增主题只改这里 + 新 pack）
  registry.ts        # 校验、归一、选项
  apply-document.ts  # 写 CSS Variables
  apply-monaco.ts    # Monaco 主题
  index.ts           # 公共导出
src/design/editor-themes.ts  # 兼容再导出
```

## 新增主题步骤

1. `packs/my-theme.ts` 导出 `AppThemePack`
2. 在 `types.ts` 的 `AppThemeId` 联合类型加 id 常量
3. `packs/index.ts` 数组追加
4. i18n 加 `settings.appTheme…` 文案

**不要**把色板抄进 `apply-*` 或 Settings 组件。

## 约定

| 项 | 内容 |
|----|------|
| 鲸灵 Git | 默认 `tokens.css` 原色；设置里可微调，改色后才写 chrome 覆写 |
| 其它包 | 色值以公开设计系统为准，见 `packs/SOURCES.md` |
| 昼夜 | 跟 `html.dark`；每包 light/dark 各一套 |
| 旧 id | `high-contrast`→VS Code，`soft`→Claude Code |
