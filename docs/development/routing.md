# 路由

> **相关文档：** [frontend](../architecture/frontend.md) · [project-structure](project-structure.md)

---

## 原则

- 路由表集中在 `src/router`
- URL 表达可分享的位置：哪个页面、哪个仓库、哪个子视图
- 瞬时 UI（modal 内步骤）不一定进 URL；深链需要的再进

---

## 目标路由表

| 路径 | 页面 | 说明 |
|------|------|------|
| `/` | Dashboard | 项目 / 最近 / 收藏 |
| `/settings` | （可选） | 完整设置优先用右侧抽屉；路由页可后续作深链备用 |
| `/settings/ai` | AiSettings | AI 提供商（后续） |
| `/repo/:projectId` | RepoLayout | 仓库壳，默认重定向 status |
| `/repo/:projectId/status` | StatusPage | 更改与提交 |
| `/repo/:projectId/history` | HistoryPage | 日志 / 图 |
| `/repo/:projectId/diff` | DiffPage | 可选独立 Diff |
| `/repo/:projectId/branches` | BranchesPage | 分支管理 |
| `/repo/:projectId/stash` | StashPage | |
| `/repo/:projectId/tags` | TagsPage | |

`projectId` 为数据库 UUID，**不是**路径编码。真实磁盘路径由 Store/Service 解析。

---

## 布局嵌套

```tsx
<Routes>
  <Route element={<AppLayout />}>
    <Route index element={<DashboardPage />} />
    <Route path="settings/*" element={<SettingsPage />} />
    <Route path="repo/:projectId" element={<RepoLayout />}>
      <Route index element={<Navigate to="status" replace />} />
      <Route path="status" element={<StatusPage />} />
      <Route path="history" element={<HistoryPage />} />
      {/* ... */}
    </Route>
  </Route>
</Routes>
```

`RepoLayout`：校验项目存在、触发 `project_touch_opened`、提供仓库上下文。

---

## 懒加载

```ts
const HistoryPage = lazy(() => import("@/pages/repo/HistoryPage"));
```

重依赖（Monaco、Graph）页面必须懒加载。

---

## 守卫

- 未知 `projectId`：重定向 `/` 并 toast
- 磁盘路径失效：进入「修复路径 / 移除」流程，而非空白崩溃

---

## 与导航 UI

- 侧栏 `NavLink` 与路由表同源（可导出 `repoNavItems` 常量）
- 浏览器前进后退应恢复子视图；选中文件可用 search params：`?file=src/a.ts`（可选）

---

## 决策：为何不用仅内存视图状态

| | URL 路由（采用） | 仅 Store 视图枚举 |
|--|------------------|-------------------|
| 刷新恢复 | 可以 | 否 |
| 多窗口 | 自然 | 需额外同步 |
| 复杂度 | 中 | 低 |

仓库内 tab 用嵌套路由，成本可接受。
