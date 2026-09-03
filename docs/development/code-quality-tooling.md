# 代码质量工具链

> **相关文档：** [AGENTS.md](../../AGENTS.md) · [quality](quality.md) · [coding-style](coding-style.md) · [ui-guidelines](ui-guidelines.md)

## 1. 状态与目标

状态：**已配置**

本文定义 JLGit 前端代码的静态检查、格式化与本地质量门禁。目标是尽早发现 TypeScript、Vue、Vite HMR 和格式问题。

本工具链不替代测试、Rust Clippy、安全审计或 CI。提交前请手动运行 `pnpm check`（本仓库不再使用 Husky / lint-staged 本地 Git hooks）。

## 2. 工具职责

| 工具 | 状态 | 职责 |
|---|---|---|
| ESLint 10 Flat Config | 已安装 | TypeScript、Vue 与 Vite 静态检查 |
| typescript-eslint | 已安装 | 基于 TypeScript 类型信息的规则 |
| Prettier | 已安装 | 前端源码和根配置文件的确定性格式化 |
| eslint-config-prettier | 已安装 | 关闭与 Prettier 冲突的 ESLint 格式规则 |
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
| `pnpm typecheck` | `vue-tsc --noEmit` 类型检查（含 `.vue`） | 否 |
| `pnpm check` | 依次执行 lint、格式检查和类型检查 | 否 |

## 5. 提交前检查

本仓库**不**安装 Husky / lint-staged，也**不**配置本地 `pre-commit` / `pre-push` 钩子。合并前应手动（或经 CI）执行：

```bash
pnpm check
```

## 6. 组件库约定

基础控件使用 **antdv-next** 局部导入，不再维护 `src/components/ui/` 生成目录。

- 禁止 `app.use()` 全局注册 antdv-next
- 禁止引入 `ant-design-vue`
- 领域包装放在 `src/components/` 或 `src/views/*/components/`

详见 [ui-guidelines](ui-guidelines.md)。

## 7. 配置文件

| 文件 | 作用 |
|---|---|
| `.nvmrc` | 推荐 Node 版本 |
| `eslint.config.js` | ESLint Flat Config、类型感知检查和忽略范围 |
| `.prettierrc.json` / `.prettierignore` | Prettier 规则与排除 |
| `.editorconfig` | 跨编辑器基础文本格式 |
| `pnpm-workspace.yaml` | pnpm 供应链和构建脚本策略 |

## 8. 验收标准

- `pnpm install --frozen-lockfile` 可重复安装
- `pnpm check` 通过
- Vue 单文件与 TypeScript 均纳入 ESLint / Prettier

## 9. 官方参考

- [ESLint Flat Config](https://eslint.org/docs/latest/use/configure/configuration-files)
- [typescript-eslint](https://typescript-eslint.io/getting-started/)
- [Prettier](https://prettier.io/docs/configuration)
