# 代码质量工具链

> **相关文档：** [AGENTS.md](../../AGENTS.md) · [quality](quality.md) · [coding-style](coding-style.md) · [ui-guidelines](ui-guidelines.md)

## 1. 状态与目标

状态：**已配置**

本文定义 JLGit 前端代码的静态检查、格式化和本地 Git 门禁。目标是尽早发现 TypeScript、React Hooks、Vite HMR 和格式问题，同时避免自动工具改写 shadcn CLI 管理的生成代码。

本工具链不替代测试、Rust Clippy、安全审计或 CI；Git hooks 是本地快速反馈层。

## 2. 工具职责

| 工具 | 状态 | 职责 |
|---|---|---|
| ESLint 10 Flat Config | 已安装 | TypeScript、React Hooks 与 Vite HMR 静态检查 |
| typescript-eslint | 已安装 | 基于 TypeScript 类型信息的规则 |
| Prettier | 已安装 | 前端源码和根配置文件的确定性格式化 |
| eslint-config-prettier | 已安装 | 关闭与 Prettier 冲突的 ESLint 格式规则 |
| Husky | 已安装 | 管理仓库内 Git hooks |
| lint-staged | 已安装 | 只对本次暂存的相关文件执行快速修复与检查 |
| EditorConfig | 已配置 | 统一 UTF-8、LF、缩进和文件结尾 |

ESLint 负责发现潜在错误与不安全写法，Prettier 只负责格式。禁止通过大量关闭规则来“通过检查”；规则例外必须局部、带原因且经过评审。存量代码对部分严格规则做了基线豁免（见 `eslint.config.js` 注释），新代码仍应避免这些模式。

## 3. 运行环境

- Node.js 最低版本：`22.22.1`
- 推荐版本：`.nvmrc` 固定的 Node.js `24.14.0`
- pnpm：`11.x`，项目固定为 `pnpm@11.9.0`
- 包管理器：只允许 pnpm

```bash
nvm use
pnpm install --frozen-lockfile
```

`pnpm-workspace.yaml` 默认拒绝未评审的依赖生命周期脚本；当前只允许 Vite 所需的 `esbuild`。禁止启用 `dangerouslyAllowAllBuilds`。

## 4. 命令

| 命令 | 用途 | 是否修改文件 |
|---|---|---|
| `pnpm lint` | 全量 ESLint，零 warning 门禁 | 否 |
| `pnpm lint:fix` | 全量执行 ESLint 安全修复 | 是 |
| `pnpm format` | 按 Prettier 配置格式化允许范围 | 是 |
| `pnpm format:check` | 检查格式是否一致 | 否 |
| `pnpm typecheck` | TypeScript `noEmit` 类型检查 | 否 |
| `pnpm check` | 依次执行 lint、格式检查和类型检查 | 否 |

## 5. Git hooks

### 5.1 pre-commit

`.husky/pre-commit` 执行 `pnpm exec lint-staged --no-stash`：

- JavaScript/TypeScript：Prettier（大批量暂存时不在钩子内跑 `eslint --fix`，避免 Task killed）
- CSS、JSON、HTML、YAML：Prettier
- Rust：`cargo fmt --check`（不静默改写）
- Markdown：不自动格式化
- **`--no-stash`**：不创建 backup stash，避免钩子中断/进程闪退后工作区「文件消失」。lint-staged@17 不支持在配置文件里写 `stash: false`
- ESLint 全量检查放在 `pnpm check` / `pre-push`，不阻塞日常小提交的钩子稳定性

### 5.2 pre-push

`.husky/pre-push` 执行 `pnpm check`。常规开发禁止 `--no-verify`。

## 6. shadcn/ui 生成目录保护

`src/components/ui/**` 是官方 shadcn CLI 管理区，严格禁止手工或自动改写：

- `eslint.config.js` 全局忽略该目录
- `.prettierignore` 忽略该目录
- lint-staged 调用 ESLint 时使用 `--no-warn-ignored`
- 不允许编辑器保存动作、批量格式化覆盖该目录
- 组件只能通过 `pnpm dlx shadcn@latest add <component>` 引入或更新

需要定制时，在 `src/components/common/` 或各业务域目录创建包装/组合组件。详见 [ui-guidelines](ui-guidelines.md)。

## 7. 配置文件

| 文件 | 作用 |
|---|---|
| `.nvmrc` | 推荐 Node 版本 |
| `eslint.config.js` | ESLint Flat Config、类型感知检查和忽略范围 |
| `.prettierrc.json` / `.prettierignore` | Prettier 规则与排除 |
| `lint-staged.config.mjs` | 暂存文件任务 |
| `.husky/pre-commit` / `.husky/pre-push` | 提交 / 推送门禁 |
| `.editorconfig` | 跨编辑器基础文本格式 |
| `pnpm-workspace.yaml` | pnpm 供应链和构建脚本策略 |

## 8. 验收标准

- `pnpm install --frozen-lockfile` 可重复安装
- `pnpm check` 通过
- 暂存错误的 TypeScript 文件时 pre-commit 能阻止提交
- `src/components/ui/**` 不被 ESLint、Prettier 或 lint-staged 改写

## 9. 官方参考

- [ESLint Flat Config](https://eslint.org/docs/latest/use/configure/configuration-files)
- [typescript-eslint](https://typescript-eslint.io/getting-started/)
- [Prettier](https://prettier.io/docs/configuration)
- [Husky](https://typicode.github.io/husky/get-started.html)
- [lint-staged](https://github.com/lint-staged/lint-staged)
