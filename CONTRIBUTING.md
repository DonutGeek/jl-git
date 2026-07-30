# 贡献指南

感谢关注 JLGit。本文说明如何搭建环境、提交改动与参与评审。

项目硬性约束见 [AGENTS.md](AGENTS.md)。行为准则见 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。

---

## 开始之前

1. 确认改动符合产品边界：本地 Git 工作流，而非无关功能
2. 大改动先开 Issue 讨论方向（架构、新依赖、新 Command）
3. 阅读与你改动相关的文档（架构 / API / 安全），避免与 SSOT 冲突

相关索引：[AGENTS.md §25 文档索引](AGENTS.md)

---

## 开发环境

### 依赖

- Node.js：最低 `>=22.22.1`，推荐 `.nvmrc` 的 `24.14.0`（`nvm use`）
- pnpm 11.x（唯一包管理器，见 `packageManager`）
- Rust（stable）与 Tauri 2 系统依赖
- 系统 `git` 可执行

平台依赖安装可参考 [Tauri 前置条件](https://v2.tauri.app/start/prerequisites/)。

### 常用命令

```bash
nvm use
pnpm install
pnpm tauri dev      # 桌面调试（推荐）
pnpm dev           # 仅 Vite
pnpm check         # ESLint + Prettier + typecheck
pnpm build         # tsc + vite build
pnpm tauri build   # 打包
```

质量门禁与 `src/components/ui/**` 保护见 [code-quality-tooling](docs/development/code-quality-tooling.md)。

---

## 分支策略

| 分支 | 用途 |
|------|------|
| `main` | 稳定主线 |
| `feat/<topic>` | 新功能 |
| `fix/<topic>` | 缺陷修复 |
| `docs/<topic>` | 仅文档 |
| `refactor/<topic>` | 重构 |
| `chore/<topic>` | 工程杂项 |

保持分支短命；一个 PR 只做一件事。

---

## Commit 约定

使用 [Conventional Commits](https://www.conventionalcommits.org/)：

```
<type>(<scope>): <summary>
```

**type：** `feat` `fix` `refactor` `style` `docs` `test` `perf` `build` `ci` `chore`

**scope（常用）：** `project` `git` `diff` `branch` `ui` `theme` `tauri` `db` `ai` `docs`

**summary：** 使用中文或英文均可，但同一 PR 内保持一致；陈述「做了什么」的结果，而非过程流水账。

示例：

```
feat(project): 支持从文件夹导入仓库
fix(git): 正确处理 detached HEAD 状态展示
docs(architecture): 补充 Command 错误码约定
```

---

## 代码要求（摘要）

完整规则见 [AGENTS.md](AGENTS.md) 与 [coding-style](docs/development/coding-style.md)。

- UI → Service → Tauri Command → Rust；禁止在组件里散落 `invoke`
- 禁止 `any`、空 `catch`、硬编码颜色
- 新 Git 能力同时更新：`docs/architecture/command.md` 与对应 `docs/api/*.md`
- 功能状态变更同步 [feature-list](docs/product/feature-list.md)
- 注释使用中文，只解释非显然逻辑
- 不提交密钥、凭据、本机绝对路径隐私

---

## Pull Request

### 提交前自检

- [ ] `pnpm check` 通过
- [ ] `pnpm build` 通过（或至少无新增类型错误）
- [ ] 未手工改写 `src/components/ui/**`
- [ ] 手动验证相关路径（桌面端优先）
- [ ] 文档与 Command/API 已同步
- [ ] 无无关文件与格式化噪音
- [ ] Commit 信息符合约定

### PR 描述建议

```markdown
## 动机
（为什么需要这次改动）

## 改动
- …

## 验证
- [ ] …

## 文档
- 更新了：…
```

### 评审关注点

- 是否破坏分层与安全边界
- 是否引入不必要依赖
- 错误路径是否对用户可见
- 是否与 AGENTS Never Rules 冲突

维护者可能要求拆分过大的 PR。

---

## 文档贡献

文档体系约定：

- **单一真相源**：见各文档文首「相关文档」与 [AGENTS 职责说明](AGENTS.md)
- **语言**：中文
- **禁止**：TODO 占位、与代码矛盾的过期描述
- 架构决策写进对应 architecture 文档；若未来引入 ADR 目录，再迁移重大决策

---

## Issue 报告

缺陷 Issue 请包含：

- 系统与 JLGit 版本
- 复现步骤
- 期望 / 实际行为
- 相关日志（脱敏后）

功能请求请说明：用户场景、是否可用现有 Git 工作流替代、优先级建议。

---

## 安全问题

疑似安全漏洞请**不要**公开 Issue 细节。优先私下联系维护者，并参考 [security](docs/development/security.md) 中的报告原则。

---

## License

贡献代码即同意以项目 [MIT License](LICENSE) 授权。
