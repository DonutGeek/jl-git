# 设置 · 性能面板 Implementation Plan

> **For agentic workers:** 按任务顺序实现；步骤用 checkbox 跟踪。

**Goal:** 关于页去掉运行状态；设置新增「性能」仪表盘（本进程指标可视化）。

**Architecture:** Rust 扩展进程采样 + 低频数据目录体积；前端 `SettingsPerformancePanel` 复用/抽离图表小组件；抽屉分类 `performance`。

**Tech Stack:** Tauri command、React、SVG 自绘环/折线、i18n、Design Tokens

## Global Constraints

- UI 颜色只用 tokens（`chart-*` 等），禁止硬编码业务色
- 主滚动用 ScrollArea（设置抽屉已有）
- 文案走 i18n
- YAGNI：不做主机监控

---

### Task 1: Rust 扩展运行时 + 数据目录体积

- [ ] 扩展 `SystemRuntimeStats`：`thread_count: Option<u32>`
- [ ] macOS/Linux `ps` 增加线程列；Windows 读 Threads.Count
- [ ] 新增 `app_data_usage` → `{ path, totalBytes }`
- [ ] 注册 command；前端 `system.info.ts` 类型与 API

### Task 2: 抽离图表组件 + 性能面板

- [ ] `SettingsPerfCharts.tsx`：RingGauge / Sparkline / MeterBar
- [ ] `SettingsPerformancePanel.tsx`：仪表盘布局与轮询
- [ ] 精简 `SettingsAboutPanel`：仅关于信息

### Task 3: 抽屉接入 + i18n

- [ ] `SettingsDrawerCategory` 增加 `performance`
- [ ] 导航项在 about 上方，渲染新面板
- [ ] zh-CN / en 文案；关于 hint 去掉「运行状态」

### Task 4: 自检

- [ ] `tsc --noEmit`
- [ ] 冒烟：打开性能见实时刷新；关于无运行块
