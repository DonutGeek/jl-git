# Vue 3 + antdv-next 换栈 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 JLGit 产品 UI 从 React 19 + shadcn 换成 Vue 3 + antdv-next，并在本分支做到与现 React 版 1:1 功能对齐。

**Architecture:** 产品入口只挂 Vue。Tauri / `src/services/` / `src/api/` / 领域类型保留。全局状态为 Pinia（`src/store/modules/`）；persist 仍读写旧 `{ state, version }` 信封。文案目标为 `src/locales/` + vue-i18n。

**Tech Stack:** Vue 3 `<script setup>`、Vue Router、Pinia、vue-i18n、antdv-next（局部导入）、图标经 `components/Icon`（morphicons + lucide 数据）、Tailwind 4 + `src/design/` Token、Axios `requestClient`、Tauri 2。

## Global Constraints

- 禁止 `app.use()` 全局注册 antdv-next；禁止引入 `ant-design-vue`
- 禁止双栈作为产品 UI：入口只能是 `src/main.ts` + `App.vue`
- UI 不直连 `invoke`；HTTP 不临时 `axios.create`
- 图标只经 `@/components/Icon`；文件类型图标仍用 `material-icon-theme`
- 主滚动容器不得用裸 `overflow-*-auto` 交付
- 文案走 i18n；注释中文
- 不引入 VxeTable / 第二套状态库 / 第二套 UI 库
- 过渡期可保留未引用的 `.tsx` 作对照，合入前必须删掉 React 运行时依赖

---

## 阶段总览

| 阶段 | 可验证产物 |
|------|------------|
| M1 工程骨架 | `pnpm tauri dev` 以 Vue 启动；主题/语言/antd ConfigProvider 生效；现有子窗路由不 404 |
| M2 主窗壳 | 标签栏、工作区宿主、状态栏、设置抽屉、操作日志（对齐现 `AppLayout`） |
| M3 仪表盘 / 项目管理 | `views/dashboard`、`views/projectManage` |
| M4 仓库页 | Status / History / Diff / 提交盒 |
| M5 子窗 | 分支管理/比较/历史、提交/文件历史 |
| M6 鲸灵 | 单仓侧栏 + 多仓子窗 |
| M7 收口 | 删除 React/shadcn/i18next；全域 Pinia；`pnpm check`；冒烟全路径 |

当前执行 **M7**（React 运行时已卸；Pinia 迁移另开）。

---

### Task 1: M1 工程骨架

**Files:**
- Create: `src/main.ts`、`src/App.vue`、`src/store/index.ts`、`src/store/plugin/persist.ts`、`src/router/index.ts`、`src/router/routes/index.ts`、`src/router/guard/index.ts`、`src/router/types/index.ts`、`src/locales/index.ts`、`src/locales/helper.ts`、`src/locales/lang/zh-CN.ts`、`src/locales/lang/en.ts`、`src/hooks/setting/useTheme.ts`、`src/components/Icon/index.ts`、`src/components/Icon/Icon.vue`、`src/components/Icon/src/resolveLucideIcon.ts`、`src/layouts/default/index.vue`、`src/views/migrationPlaceholder/index.vue`
- Modify: `package.json`、`vite.config.ts`、`index.html`、`tsconfig.json`、`eslint.config.js`、`src/vite-env.d.ts`、`src/i18n/locales/{zh-CN,en}/common.json`
- Delete: `src/main.tsx`、`src/App.tsx`、`src/router/index.tsx`（避免与 Vue `router/index.ts` 撞名）

**Interfaces:**
- Consumes: 现有 `initTheme` / `initLocale` / `initAppPrefs` / `startOpLogListener`、`src/i18n/locales/*` JSON、`theme.service`
- Produces: `setupStore(app)`、`setupI18n(app)`、`setupRouter(app)`、`Icon`、`useTheme()`（`antdTheme` / `isDark`）

- [x] **Step 1: 安装依赖**

```bash
pnpm add vue vue-router pinia pinia-plugin-persistedstate vue-i18n antdv-next @vueuse/core lodash-es
pnpm add -D @vitejs/plugin-vue vue-tsc eslint-plugin-vue vue-eslint-parser @types/lodash-es
```

- [x] **Step 2: 切换 Vite / HTML / 类型检查入口**

`vite.config.ts` 用 `@vitejs/plugin-vue` 替换 `@vitejs/plugin-react`。`index.html` 挂 `#app` + `/src/main.ts`。`pnpm typecheck` 改为 `vue-tsc --noEmit`。

- [x] **Step 3: 落地 bootstrap**

`main.ts` 只 `createApp` + `setupStore` / `setupI18n` / `setupRouter`，**禁止** `app.use(antd)`。`App.vue` 局部导入 `ConfigProvider` 与 `App`。

- [x] **Step 4: 路由对齐现网窗口**

保留现 React 路径（`/project-manage`、`/branch-compare`、`/agent` 等），主窗走 `layouts/default`。未迁页面统一 `views/migrationPlaceholder`，禁止 404 白屏。

- [x] **Step 5: 验证**

```bash
pnpm typecheck
pnpm exec eslint src/main.ts src/App.vue src/router src/locales src/store/index.ts src/store/plugin src/hooks/setting src/components/Icon src/layouts/default src/views/migrationPlaceholder --max-warnings=0
```

Expected: 通过。`pnpm tauri dev` 能看到 Vue 壳（主题 token 背景 + 迁移说明），子窗 URL 能打开同一壳。

- [ ] **Step 6: Commit**（仅当用户明确要求时）

---

### Task 2: M2 主窗壳

- [x] AppLayout 生命周期（冷启动标签、项目管理桥、快捷键）
- [x] 标签栏（开/关/切换/右键；拖拽排序留到后续）
- [x] WorkspaceHost 保活仪表盘 / 仓库
- [x] 状态栏、操作日志、设置抽屉（外观/通用/关于已接；其余分区占位）

### Task 3: M3 仪表盘 / 项目管理

- [x] 仪表盘接入 `ProjectManager`（最近 / 打开 / 克隆 / 分组）
- [x] `/project-manage` 子窗：筛选 + 表格 + 打开/编辑/删除
- [ ] 分组拖拽排序、Lucide 全量图标选择、克隆后填详情、目录导入导出（S2，后补）

### Task 4: M4 仓库页

- [x] 仓库壳：工具栏（视图 / 分支 / 同步）+ 活动栏 + 分栏
- [x] 变更列表 + 提交盒 + 文本 Diff
- [x] 历史列表 + 详情 + 分支侧栏
- [ ] Monaco Diff、目录树、工作区浏览、标签、历史图谱（S2，后补）
- [x] `pnpm typecheck` / 新文件 eslint / `vite build`

### Task 5: M5 子窗

- [x] 分支管理：筛选列表 + 删除
- [x] 分支比较：文件 Diff + 独有提交
- [x] 分支 / 提交 / 文件历史
- [ ] Monaco Diff、虚拟表格、右键菜单、编码切换（S2，后补）

### Task 6: M6 鲸灵

- [x] 单仓侧栏：会话 Tab / 纯文本消息 / 流式发送停止 / 模型与深度思考
- [x] 多仓子窗：已登记仓画像 + 会话列表 + 普通问答（`/agent` `/jinglv` `/resume-helper`）
- [ ] `@` 提及、插件/技能目录、Markdown 高亮、简历成稿、消息编辑/重生成、会话拖拽（S2，后补）

### Task 7: M7 收口（零 React 运行时）

- [x] 删除 `src/pages/`、`src/components/ui/` 及全部 `.tsx`
- [x] 服务层 `src/i18n` 改为 vue-i18n 门面（`t` / `changeLanguage`）；卸掉 `i18next` / `react-i18next`
- [x] sonner → antdv-next `message`；图标经 `@/components/Icon`（morphicons + `lucide` 数据）
- [x] `package.json` 卸掉 React / Radix / shadcn 相关依赖；ESLint / `tsconfig` 去掉 React JSX
- [x] `pnpm typecheck` / `pnpm lint` / `pnpm format:check` / `vite build`
- [x] Store 归入 `src/store/modules/`；全域 Pinia（persist 仍读 `{ state, version }` 信封）
- [x] 主壳组件归入 `layouts/default/`；仓库活动栏/工具栏就近 `views/repo/components/`；主布局改 antdv-next `Layout`
- [x] store 文件改为 vben 风 `locale.ts` 等（导出仍 `useXxxStore` + `WithOut`）；layouts 补 `page` / `iframe` 与 default 的 header/footer/sider/setting
- [x] 业务表单改 antdv `Form` / `FormItem` / `Row` / `Col`；`Icon` 内部接 morphicons
- [x] Zustand → Pinia：`repo` / `app` / `multipleTab` / `project` / `shortcut` / `opLog` / 鲸灵 store 均已改 `defineStore`；组件外用 `WithOut()`
- [ ] 本地 `pnpm tauri dev` 冒烟（开仓 / 切标签 / 提交盒）
- [ ] **Step: Commit**（仅当用户明确要求时）

## 后续阶段

桌面冒烟（`pnpm tauri dev`：开仓 / 切标签 / 提交盒）与合入前 commit 仍待用户确认。持久化键保持 `jlgit-locale` / `jlgit-theme` / `jlgit-app-prefs`。
