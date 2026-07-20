# 历史图谱铁路观感（路径 B：自研 SVG）

日期：2026-07-20

## 目标

History 左侧提交图采用**铁路图**展现：竖轨、跨 lane 直线斜段、合并方块 / tip 空心圆 / 普通实心圆。不依赖 `@gitgraph/react`。

## 方案

1. `src/utils/historyGraphLayout.ts`：newest-first lane 分配（主父继承本列，次父占新列）
2. `HistoryGraph.tsx`：SVG 按行绘制 top/bottom 连线与节点
3. 数据仍用 `git log` 的 `parentIds`（仅连接本页已加载提交）；不落地 `git_graph_commits`
4. 行高 32px + 列表 `pt-1.5(6)` 对齐；宽度上报供 ScrollArea 横滑

## 验收

- 多分支：竖线为主，分叉/合并为斜线（非贝塞尔）
- 合并方块、当前分支 tip 空心、其余实心
- 行对齐、横滑、悬停/点击正常；`vitest` 布局单测与 `tsc` 通过
