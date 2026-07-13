# 项目结构

> **相关文档：** [frontend](../architecture/frontend.md) · [tauri](../architecture/tauri.md) · [coding-style](coding-style.md)

本文是**目录归属**的唯一真相源。

---

## 仓库根

```
JLGit/
├── AGENTS.md
├── README.md
├── CONTRIBUTING.md
├── CHANGELOG.md
├── LICENSE
├── CODE_OF_CONDUCT.md
├── docs/
│   ├── architecture/
│   ├── development/
│   ├── product/
│   ├── api/
│   └── assets/                 # 截图等静态资源（按需）
├── public/
├── src/                        # 前端
├── src-tauri/                  # Rust / Tauri
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
└── vite.config.ts
```

---

## 前端目标树

```
src/
├── assets/
├── components/
│   ├── common/           # 跨领域通用（EmptyState、ErrorBlock）
│   ├── git/              # StatusList、CommitForm、BranchSelect…
│   ├── layout/           # AppHeader、RepoSidebar…
│   ├── project/          # ProjectCard、ProjectList…
│   └── ui/               # shadcn 基础组件
├── hooks/
│   ├── useGitStatus.ts
│   ├── useProjects.ts
│   └── ...
├── layouts/
│   ├── AppLayout.tsx
│   └── RepoLayout.tsx
├── pages/
│   ├── DashboardPage.tsx
│   ├── settings/
│   └── repo/
├── router/
│   └── index.tsx
├── services/
│   ├── tauri.ts          # invoke 薄封装
│   ├── project/
│   ├── git/
│   │   ├── index.ts
│   │   ├── git.status.ts
│   │   ├── git.branch.ts
│   │   ├── git.commit.ts
│   │   ├── git.diff.ts
│   │   ├── git.remote.ts
│   │   └── ...
│   ├── settings/
│   ├── notification/
│   ├── theme/
│   └── ai/
├── store/
│   ├── useProjectStore.ts
│   ├── useGitStore.ts
│   ├── useUiStore.ts
│   └── useSettingsStore.ts
├── design/               # Design Tokens、主题 CSS、Monaco 主题桥接
│   ├── index.css         # 入口（由 src/index.css 引入）
│   ├── tokens.css        # 语义色 / 圆角（:root + .dark）
│   ├── theme-map.css     # Tailwind @theme 映射
│   ├── base.css          # 全局基础样式
│   └── monaco.theme.ts   # Monaco ↔ CSS Variables
├── types/
│   ├── project.ts
│   ├── git.ts
│   ├── settings.ts
│   └── error.ts
├── utils/
├── App.tsx
├── main.tsx
└── vite-env.d.ts
```

---

## 归属规则

| 放这里 | 条件 |
|--------|------|
| `components/ui` | shadcn/ui 官方生成件（[按需引入](ui-guidelines.md#shadcnui)）；无业务语义 |
| `components/<domain>` | 有领域含义、可复用 |
| `pages` | 绑定路由的页面组装 |
| `hooks` | 可复用的 React 状态/副作用 |
| `services` | 一切 IPC / 持久化 |
| `store` | 跨树会话状态 |
| `design` | Design Tokens、主题 CSS、编辑器主题桥接 |
| `types` | 跨模块共享类型 |
| `utils` | 无副作用纯函数 |

**新增文件前问：** 它属于哪个域？能否复用？是否其实是 Service？

---

## Rust 目标树

见 [tauri.md](../architecture/tauri.md) 目录一节。要点：

- `commands/` 按域
- `git/` 执行与解析
- `db/` 迁移与访问
- `lib.rs` 保持瘦

---

## 文档树职责

| 目录 | 写什么 |
|------|--------|
| `docs/architecture` | 系统如何工作、为何如此 |
| `docs/development` | 日常如何写代码 |
| `docs/product` | 做什么、做到哪 |
| `docs/api` | 前端 Service 契约 |

禁止在多个文件复制同一段规范；交叉引用。

---

## 增长到 100+ 组件时

- 按域加深 `components/git/*` 子目录，而不是扁平堆文件
- 可引入 `features/<name>` **仅当** 某功能同时拥有私有 components+hooks+types；默认仍推荐现有分层，避免两套组织法并存
- 删除死代码与未用依赖，胜过再加抽象层
