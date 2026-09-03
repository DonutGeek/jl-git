# 项目结构

> **相关文档：** [frontend](../architecture/frontend.md) · [tauri](../architecture/tauri.md) · [coding-style](coding-style.md)
>
> 前端目录与命名对齐 **work-center-web**。本文是**目录归属**的唯一真相源。

---

## 仓库根

```
JLGit/
├── AGENTS.md
├── README.md
├── docs/
│   ├── architecture/
│   ├── development/
│   ├── product/
│   ├── api/
│   └── assets/                 # 截图等静态资源（按需）
├── public/
├── src/                        # Vue 前端
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
├── components/              # 可复用封装：PascalCase 目录 + index.ts + src/
│   ├── Icon/                # UI 图标唯一入口
│   │   ├── index.ts
│   │   └── src/
│   ├── ScrollArea/
│   ├── Common/
│   ├── Git/
│   ├── Project/
│   ├── Agent/
│   └── Ai/
├── design/                  # Design Tokens、Tailwind 入口、antdv-next 覆盖、Monaco 桥接
│   ├── index.css
│   ├── tokens.css
│   ├── theme-map.css
│   ├── base.css
│   └── monaco.theme.ts
├── hooks/                   # 应用级组合式
│   ├── setting/             # 主题、布局等
│   ├── web/
│   ├── core/
│   ├── event/
│   └── component/
├── layouts/                 # 对齐 vben 2：default / page / iframe
│   ├── default/             # 主窗：header、footer、content、sider、setting、feature
│   ├── page/                # 子窗 PageLayout（可选 windowHeader）
│   └── iframe/              # meta.frameSrc 内嵌页
├── locales/
│   ├── index.ts             # setupI18n
│   ├── helper.ts
│   └── lang/
│       ├── zh-CN.ts
│       ├── en.ts
│       ├── zh-CN/           # 按域拆分：common.json、repo.json…
│       └── en/
├── api/                     # 外部 HTTP（Axios）；按域拆分，复用 requestClient
│   ├── ai.ts
│   └── hosting.ts
├── router/
│   ├── index.ts             # setupRouter / 路由实例
│   ├── guard/
│   ├── helper/
│   ├── types/
│   └── routes/
│       ├── index.ts         # glob 合并 modules + 404
│       ├── basic.ts         # 未匹配兜底
│       └── modules/         # 按域拆：dashboard / git / project / agent
├── services/                # Tauri invoke / 持久化（Git / FS / SQLite）
│   ├── invoke.ts
│   ├── project/
│   ├── git/
│   │   ├── index.ts
│   │   ├── git.status.ts
│   │   ├── git.branch.ts
│   │   └── ...
│   ├── settings/
│   ├── notification/
│   ├── theme/
│   └── ai/
├── store/
│   ├── index.ts             # createPinia + setupStore(app)，不 barrel 各 module
│   ├── plugin/              # persist 等
│   └── modules/             # locale.ts / theme.ts / repo.ts…（文件名无 use 前缀）
├── types/
├── utils/
│   └── http/                # Axios 封装：requestClient、拦截器、取消请求
├── views/                   # 路由级页面：camelCase 目录 + index.vue
│   ├── dashboard/
│   │   ├── index.vue
│   │   └── hooks/
│   ├── repo/
│   │   ├── index.vue
│   │   ├── components/
│   │   ├── hooks/
│   │   └── utils/
│   └── projectManage/
│       ├── index.vue
│       ├── components/
│       └── hooks/
├── App.vue
├── main.ts
└── vite-env.d.ts
```

---

## 归属规则

| 放这里 | 条件 |
|--------|------|
| `components/<PascalCase>` | 跨页复用封装：`index.ts` 公开导出，实现放 `src/`（如 `Icon`、`Git`、`Project`） |
| `views/<camelCase>/` | 绑定路由的页面组装；入口为 `index.vue` |
| `views/<camelCase>/components` | **仅该页**使用的组件 |
| `views/<camelCase>/hooks` | **仅该页**的 `useXxx` 与请求生命周期 |
| `views/<camelCase>/utils` | **仅该页**的无状态转换 / 导航函数 |
| `hooks/<layer>` | 跨页面的组合式能力 |
| `services` | Tauri IPC / 本地持久化（Git、FS、SQLite、窗口） |
| `api` | 外部 HTTP 接口函数；只使用 `utils/http` 的 `requestClient` |
| `utils/http` | Axios 单例、拦截器、错误归一；页面不得再 `axios.create` |
| `store` | 跨树会话状态；目录名固定单数 |
| `design` | Design Tokens、主题 CSS、编辑器主题桥接 |
| `locales` | vue-i18n 与按域 JSON |
| `types` | 跨模块共享类型 |
| `utils` | 无副作用纯函数 |

**新增文件前问：** 它属于哪个域？能否复用？走 Tauri（`services/`）还是 HTTP（`api/`）？是否应就近放进当前 `views/<module>/`？

### 就近分层（硬性，对齐 work-center）

路由级业务模块：

- 页面入口为 `index.vue`，只负责编排（`defineOptions` 仍用 PascalCase 组件名，如 `RepoPage`）
- 私有组件进 `components/`
- `useXxx` 进 `hooks/`
- 无状态函数进 `utils/`
- 对应 `*.spec.ts` 与实现文件同目录

**禁止**把 `useXxx.ts`、导航工具或其测试直接堆在页面模块根目录。

---

## 与 work-center 的差异（刻意保留）

| work-center-web | JLGit | 原因 |
|-----------------|-------|------|
| `src/api/` + Axios | **同样采用**；另保留 `src/services/` 走 Tauri | HTTP（AI、托管平台）与本地 Git/FS 分轨 |
| `VxeTable` | antdv-next `Table` + 虚拟列表 | Git 客户端以树/Diff/历史为主，YAGNI |
| `v-permission` | 不引入 | 无前端 RBAC |
| `build/vite` 插件集合 | 根目录 `vite.config.ts` | 单仓桌面应用，保持简单 |

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

- 跨页复用进 `components/<PascalCase>`（`index.ts` + `src/`）
- 页面私有逻辑留在 `views/<module>/`，不要提前抽到全局
- 删除死代码与未用依赖，胜过再加抽象层
