# 鲸灵只读代码工具 Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** 单仓/多仓鲸灵通过只读 `list_dir` / `read_file` / `search_code` 回答代码位置类问题。

**Architecture:** DeepSeek function calling；工具轮非流式；最终回答流式。安全策略集中在 `agent.codePolicy` + Rust 路径校验；执行在 `ai.tools`；挂入 `ai.agent` / `ai.multi`。

**Tech Stack:** Tauri 2、Rust `git grep`、TypeScript Service、DeepSeek tools API

## Global Constraints

- 只读；禁止写工具
- UI 不直连 invoke；经 Service
- 禁止 `any`；文案 i18n（用户可见错误）
- 多仓必须限定已允许仓根

---

## File map

| File | Role |
|------|------|
| `src-tauri/src/git/grep.rs` + command | `git_grep` 受限搜索 |
| `src/api/git/grep.ts` | 前端 Git 搜索接口 |
| `src/services/agent/agent.codePolicy.ts` | Deny / 限长 / 路径策略 |
| `src/services/ai/ai.tools.ts` | Tool schema + execute |
| `src/services/ai/ai.toolLoop.ts` | 非流式工具环 + 最终流式 |
| `src/services/ai/ai.agent.ts` / `ai.multi.ts` | 接入 |
| `src/prompts/agent/*` | 告知可用工具与多仓 @ 规则 |
| `docs/product/ai.md` / command.md / api/git.md | 文档 |

---

### Task 1: `git_grep` Command + Service

- [x] Rust：`git grep -n -I -e <pattern> -- <pathspec?>`，cwd=repo，参数数组，limit
- [x] 注册 command；前端 `searchCode`
- [x] `pnpm check` / `cargo check` 相关

### Task 2: Code policy + tool executor

- [x] `agent.codePolicy.ts`：deny patterns、max bytes、sanitize path
- [x] `ai.tools.ts`：三种工具定义与执行（复用 listDir / readWorktreeFile / searchCode）
- [x] 策略覆盖：deny `.env`、越界相对路径拒绝

### Task 3: Tool loop + wire hosts

- [x] `ai.toolLoop.ts`：最多 6 轮；工具后 `redactSecrets`
- [x] `streamAgentReply`：通用模式启用
- [x] `streamMultiAgentReply`：仅 `allowedRepoRoots`（来自 @project 画像）非空时启用
- [x] Prompt 补充

### Task 4: Docs + verify

- [x] 更新 `docs/product/ai.md`、`command.md`、`api/git.md`
- [x] `pnpm check`、`cargo check`/`test`、`pnpm build`
