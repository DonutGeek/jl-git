# 应用主题色板来源

各 pack 文件内亦有注释。汇总如下，便于核对与更新。

| 主题 | 背景 / 前景 / 强调 | 主要依据 |
|------|-------------------|----------|
| **鲸灵 Git** | 不覆写，用 `tokens.css` | shadcn/ui 默认 |
| **GitHub** | `#FFFFFF`/`#1F2328`/`#0969DA`；深 `#0D1117`/`#E6EDF3`/`#4493F8` | [Primer](https://primer.style) canvas / accent.fg |
| **VS Code** | 浅 `#FFFFFF`/`#3B3B3B`/`#005FB8`；深 `#181818`/`#CCCCCC`/`#0078D4` | vscode `light_modern.json` / `dark_modern.json` |
| **Claude Code** | 浅 `#FAF9F5`/`#141413`/`#D97757`；深 `#141413`/`#FAF9F5`/`#D97757` | Anthropic Ivory / Slate / Clay |
| **Codex** | 浅白底+蓝；深 `#181818`/`#F5F5F5`/`#339CFF` | Codex App Appearance / 默认深色观感 |

新增或改色：只改 `packs/<name>.ts`，并在本表补一行来源。
