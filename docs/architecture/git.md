# Git 执行模型

> **相关文档：** [overview](overview.md) · [command](command.md) · [api/git](../api/git.md) · [security](../development/security.md)

---

## 目标

- 行为与用户本机 Git 一致
- 解析结果类型化，UI 不碰原始 porcelain 字符串
- 安全：无 shell 拼接、路径受控

---

## 执行链路

```
GitService.* 
  → invoke("git_*")
    → commands/git.rs
      → git/runner.rs（拼装 args、执行、超时）
        → git/<op>.rs（解析 stdout → DTO）
```

UI / Store 只消费 DTO。

---

## Runner 职责

| 职责 | 说明 |
|------|------|
| 定位 `git` 可执行文件 | `PATH`；允许设置中覆盖自定义路径 |
| 统一环境 | 可设置 `GIT_TERMINAL_PROMPT=0` 等，避免交互卡死 |
| 参数数组 | 永不把整行命令当 shell |
| 捕获 | stdout / stderr / exit code |
| 超时 | fetch/push/clone 可配置 |
| 日志 | 记录子命令名与安全参数 |

---

## 仓库上下文

每个 Git Command 至少包含：

```ts
interface RepoRef {
  path: string; // 规范化后的仓库工作树路径
}
```

Rust 侧：

1. 规范化路径
2. 验证为 Git 工作树（`rev-parse --show-toplevel`）
3. 后续操作使用该 toplevel，防止路径逃逸到仓库外（对写操作尤其重要）

---

## 输出解析策略

| 命令族 | 推荐格式 | 说明 |
|--------|----------|------|
| status | `--porcelain=v2 --branch --untracked-files=all` | 稳定、可解析；展开未跟踪目录内文件 |
| branch | `for-each-ref` / `branch -vv` | 结构化字段 |
| log | `--format` 自定义可解析分隔 | 避免依赖本地 `log.decorate` 颜色 |
| diff | `--numstat` + patch 按需 | 大 diff 分页/截断 |
| stash / tag | porcelain 或 for-each-ref | 同分支策略 |

**禁止**依赖彩色 ANSI 输出做解析。

解析失败 → `GIT_FAILED` 或 `INTERNAL`，并保留原始片段到日志（截断）。

---

## 写操作约定

| 操作 | 前置条件 | 备注 |
|------|----------|------|
| stage/unstage | 路径相对仓库根 | 拒绝 `..` |
| commit | message 非空；`paths` 非空；允许 hooks 失败上浮 | 提交时重建 index（reset + update-index + `commit -F -`）；不默认 `--no-verify` |
| checkout/switch | 工作区冲突检测 | 脏工作区策略由产品定义 |
| push/pull | 远程与分支明确 | 凭据走系统 helper，应用不存密码 |

### 操作日志

`commit` / `fetch` / `pull` / `push` 经 `oplog::run_logged` 包裹；runner 在活动操作内每次 git 调用 emit `jlgit://git-op`（start / cmd / end）。前端按仓库聚合，状态栏展示最近结果。

应用**默认不跳过 hooks**。若未来提供「跳过 hooks」选项，必须二次确认，并记入审计日志。

---

## 并发与刷新

- 同一仓库同一时刻：写操作串行化（队列）；读可并行但可合并（status 抖动合并）
- UI 在 focus / 操作成功后刷新 status
- 文件监听（可选，后续）：debounce 后触发 `git_status`

---

## 版本兼容

- 启动时检测 `git --version`，低于最低版本则提示（目标：Git 2.30+）
- 新语法（如 `switch`）可做能力探测，失败回退 `checkout`

---

## 决策对比

| 方案 | 优点 | 缺点 |
|------|------|------|
| **系统 Git CLI（采用）** | 与用户环境一致；hooks/凭据完整 | 依赖外部二进制 |
| libgit2 / gix | 无外部依赖 | 行为分叉；LFS/hooks 复杂 |
| 混合 | 读用库、写用 CLI | 两套语义，维护成本高 |

v1 坚持 CLI；仅在性能热点有证据时局部引入库，且不改变 Command 契约。

---

## 与 AI 的边界

AI 可建议 commit message / 解释 diff，但：

- **不**直接执行 Git
- 必须经用户确认后走现有 `git_commit` 等 Command

见 [ai](../product/ai.md)。
