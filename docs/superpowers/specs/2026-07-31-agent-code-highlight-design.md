# 鲸灵代码块语法高亮设计

日期：2026-07-31

## 目标

鲸灵 Markdown 围栏代码块按当前应用主题着色，与 Monaco 使用的 `pack.syntax` 同源；引擎为 highlight.js。

## 已确认

| 项 | 规则 |
|----|------|
| 引擎 | highlight.js（按需注册，更广语言集） |
| 配色 | 主题包 `syntax` light/dark → CSS 变量 `--syntax-*` |
| 原生主题 | 鲸灵 Git（nativeTokens）无 pack.syntax 时用默认 syntax 色板 |
| 未知语言 | 纯文本转义，不高亮、不报错 |
| 滚动/复制 | 保持现有 ScrollArea + 复制 |

## 非目标

- Shiki / 气泡内 Monaco
- Mermaid / 数学公式
- 引入 DOMPurify（hljs 已转义源码；仅输出 span/class）

## 结构

1. `apply-document`：写入 `--syntax-comment` 等
2. `agent-syntax.css`：`.hljs-*` → `var(--syntax-*)`
3. `agentHighlight.ts`：注册语言 + `highlightAgentCode`
4. `AgentMarkdownCodeBlock`：渲染高亮 HTML

## 语言（更广）

typescript / javascript（含 ts、tsx、js、jsx 别名）、json、bash、shell、powershell、python、rust、go、java、kotlin、swift、c、cpp、csharp、ruby、php、sql、yaml、xml、html、css、scss、markdown、diff、dockerfile、toml、ini、graphql、lua、r、scala、perl、objectivec、vbnet、plaintext。
