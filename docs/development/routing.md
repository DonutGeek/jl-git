# 路由

> **相关文档：** [frontend](../architecture/frontend.md) · [project-structure](project-structure.md)
>
> 组织方式对齐 **vben 2**：`src/router/index.ts` + `routes/modules/` + `guard/`。

---

## 原则

- 路由实例在 `src/router/index.ts` 创建，经 `setupRouter(app)` 注册
- 业务路由按域拆在 `src/router/routes/modules/`（`dashboard` / `git` / `project` / `agent`）；`routes/index.ts` 用 `import.meta.glob` 合并
- 404 等基础路由在 `src/router/routes/basic.ts`，必须放在表尾
- 布局常量在 `src/router/constant.ts`；子窗组装在 `src/router/helper/`
- 全局导航行为在 `src/router/guard/` 管理
- URL 表达可分享的位置：哪个页面、哪个仓库、哪个子视图
- 瞬时 UI（modal 内步骤）不一定进 URL；深链需要的再进
- 路由 `name` 用 lowerCamelCase；路径用 kebab-case
- 面向用户的路由必须在 `meta.title` 使用 i18n 键；`document.title` 由守卫设置

---

## 目标路由表

| 路径 | 页面 | 说明 |
|------|------|------|
| `/` | `views/dashboard` | 项目 / 最近 / 收藏 |
| `/settings` | （可选） | 完整设置优先用右侧抽屉；路由页可后续作深链备用 |
| `/settings/ai` | `views/settings/ai` | AI 提供商（后续） |
| `/repo/:project-id` | `layouts` + `views/repo` | 仓库壳，默认重定向 status |
| `/repo/:project-id/status` | `views/repo` | 更改与提交 |
| `/repo/:project-id/history` | `views/repo` 子视图 | 日志 / 图 |
| `/repo/:project-id/diff` | `views/repo` 子视图 | 可选独立 Diff |
| `/repo/:project-id/branches` | `views/branchManage` | 分支管理 |
| `/repo/:project-id/stash` | | |
| `/repo/:project-id/tags` | | |

`project-id` 为数据库 UUID，**不是**路径编码。真实磁盘路径由 Store/Service 解析。

---

## 布局嵌套

```ts
{
  path: "/",
  component: AppLayout,
  children: [
    { path: "", name: "dashboard", component: () => import("@/views/dashboard/index.vue") },
    {
      path: "repo/:project-id",
      component: RepoLayout,
      children: [
        { path: "", redirect: { name: "repoStatus" } },
        { path: "status", name: "repoStatus", component: () => import("@/views/repo/index.vue") },
        { path: "history", name: "repoHistory", component: () => import("@/views/repo/index.vue") },
      ],
    },
  ],
}
```

`RepoLayout`：校验项目存在、触发 `project_touch_opened`、提供仓库上下文。

必须保留未匹配路径的 404 路由。

---

## 懒加载

```ts
const HistoryPage = () => import("@/views/repo/index.vue");
```

重依赖（Monaco、Graph）页面必须懒加载。

---

## 守卫

- 未知 `project-id`：重定向 `/` 并提示
- 磁盘路径失效：进入「修复路径 / 移除」流程，而非空白崩溃

---

## 与导航 UI

- 侧栏菜单与路由表同源（可导出 `repoNavItems` 常量）
- 浏览器前进后退应恢复子视图；选中文件可用 query：`?file=src/a.ts`（可选）

---

## 决策：为何不用仅内存视图状态

| | URL 路由（采用） | 仅 Store 视图枚举 |
|--|------------------|-------------------|
| 刷新恢复 | 可以 | 否 |
| 多窗口 | 自然 | 需额外同步 |
| 复杂度 | 中 | 低 |

仓库内 tab 用嵌套路由，成本可接受。
