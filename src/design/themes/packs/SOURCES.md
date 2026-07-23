# 应用主题色板来源

各 pack 文件内亦有注释。汇总如下，便于核对与更新。

| 主题 | 浅色 / 深色分层 | 主要依据 |
|------|-----------------|----------|
| **鲸灵 Git** | 未自定义时不覆写，沿用 `tokens.css`；pack 中的 HEX 用于设置展示与自定义回退 | 本项目 Design Tokens / shadcn/ui 默认 |
| **GitHub** | `bgColor-default`、`bgColor-muted`、`bgColor-inset`、`fgColor-*`、`borderColor-*`、语义功能色与 GitHub 代码语法色映射 | [Primer Color](https://primer.style/product/primitives/color/) / [GitHub VS Code Theme](https://github.com/primer/github-vscode-theme) |
| **VS Code** | editor、widget、panel/sidebar、selection、border、gutter 状态色及 Light+ / Dark+ 核心语法色分别映射 | [Light Modern](https://github.com/microsoft/vscode/blob/main/extensions/theme-defaults/themes/light_modern.json) / [Dark Modern](https://github.com/microsoft/vscode/blob/main/extensions/theme-defaults/themes/dark_modern.json) / [Light+](https://github.com/microsoft/vscode/blob/main/extensions/theme-defaults/themes/light_plus.json) / [Dark+](https://github.com/microsoft/vscode/blob/main/extensions/theme-defaults/themes/dark_plus.json) |
| **Claude Code** | Anthropic 官网 Ivory / Slate / Clay / Cloud / Cactus / Sky / Heather / Fig；深色为品牌原子的反转映射 | [Anthropic 官网](https://www.anthropic.com/) 当前公开 CSS；Claude Code CLI 本身跟随终端，无完整桌面 Token |
| **Codex** | 中性黑白、低彩度背景/卡片/侧栏与克制状态色 | [Codex App 官方介绍](https://openai.com/index/introducing-the-codex-app/) 的产品界面视觉映射；OpenAI 未公开完整 Codex 色值表 |

非 native 主题包必须显式提供背景、卡片/弹层、次要背景、文字、边框、侧栏、选中态、危险色、Diff、Git 状态色与 Monaco 语法色；不得再由一套通用公式替所有主题生成。鲸灵 Git 继续沿用项目原生 Monaco 规则。

新增或改色：只改 `packs/<name>.ts`，并在本表补一行来源。
