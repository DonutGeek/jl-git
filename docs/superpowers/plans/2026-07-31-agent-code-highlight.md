# 鲸灵代码块语法高亮 Implementation Plan

> **For agentic workers:** 按任务顺序实现；每任务可独立验收。

**Goal:** 鲸灵 Markdown 代码块用 highlight.js 高亮，颜色跟随主题 `pack.syntax`（CSS 变量）。

**Architecture:** 主题应用写 `--syntax-*` → CSS 映射 hljs 类 → 代码块组件调用注册好的 highlighter。

**Tech Stack:** highlight.js、现有主题管道、AgentMarkdownCodeBlock、ScrollArea。

## 文件

| 文件 | 职责 |
|------|------|
| `src/design/themes/syntax-tokens.ts` | 默认色板 + `applySyntaxTokensToDocument` |
| `src/design/themes/apply-document.ts` | 调用写入 syntax 变量；清理列表含新 props |
| `src/design/agent-syntax.css` | hljs → CSS 变量 |
| `src/design/index.css` | 引入 agent-syntax.css |
| `src/utils/agentHighlight.ts` | 注册语言 + highlight |
| `src/components/ai/AgentMarkdownCodeBlock.tsx` | 渲染高亮 |
| `package.json` | 依赖 highlight.js |

## Tasks

### Task 1: 依赖 + syntax CSS 变量

- 安装 `highlight.js`
- 新增 `syntax-tokens.ts`，在 `applyAppThemeToDocument` 始终写入 `--syntax-*`
- `APP_THEME_TOKEN_PROPS` 纳入清理

### Task 2: hljs 映射样式 + highlighter

- `agent-syntax.css` + index 引入
- `agentHighlight.ts` 注册更广语言与别名

### Task 3: 接入代码块

- `AgentMarkdownCodeBlock` 使用高亮 HTML（`dangerouslySetInnerHTML`）
- `pnpm check`
