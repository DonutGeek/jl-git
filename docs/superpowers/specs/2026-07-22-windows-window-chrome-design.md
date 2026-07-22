# Windows 窗口顶栏（自定义 Chrome）设计

> 日期：2026-07-22  
> 状态：已批准（方案 1）  
> 相关：`RepoTabBar` · 子窗 `services/window/*` · [ui-guidelines](../../development/ui-guidelines.md) · [tauri](../../architecture/tauri.md)

---

## 1. 背景

主窗与子窗在 **macOS** 使用 Overlay 标题栏 + 系统交通灯，`RepoTabBar` / 各子窗顶栏以 `pl-[88px]` 为灯位留白，空白区 `data-tauri-drag-region` 可拖。

**Windows** 上 Overlay / `trafficLightPosition` 语义不同，系统仍可能显示原生标题栏，且 UI 仍套用 mac 左边距，顶栏观感与「图示 mac 顶栏密度」不一致。

硬性要求：

1. **适配 Windows**（主窗 + 全部子窗）
2. **必须更新文档**
3. **不得影响现有 macOS 功能与布局**

---

## 2. 目标

| 平台 | 行为 |
|------|------|
| macOS | 保持现状：Overlay、交通灯 `(16,26)`、`pl-[88px]`、拖拽与点选不变 |
| Windows | 无系统标题栏；顶栏即窗口 Chrome；右侧最小化 / 最大化·还原 / 关闭；左侧不再留 88px 空档 |
| Linux | 本轮不做专项；若 `decorations: false` 与 Win 共用路径可顺带可用，不承诺验收 |

成功标准：

- Win 安装包 / `tauri dev`（Windows）顶栏无双重标题条
- 三键可用，最大化后图标切换为还原；双击顶栏空白可最大化/还原
- 标签、打开仓库等控件仍可点（`no-drag`）
- mac 回归：交通灯位置与标签栏左边距视觉与操作与改前一致

---

## 3. 方案摘要（已选）

**平台分支 + 共用控件**：mac 继续系统灯；Win 关闭系统装饰并自绘三键；抽 layout hook + `WindowChromeControls`，主窗与子窗复用。

不选：全平台自绘红绿灯（扰动 mac）；仅调间距保留系统标题栏（达不到图示观感）。

---

## 4. 窗口配置

### 4.1 主窗 `src-tauri/tauri.conf.json`

- **保留** mac 侧字段：`titleBarStyle: Overlay`、`hiddenTitle`、`trafficLightPosition`
- Windows：增加 **`decorations: false`**（Tauri 2 按平台生效；若配置需拆 `tauri.conf` / 运行时，以「仅 Win 无边框、mac 不变」为准）

实现时以实测为准：若全局 `decorations: false` 会伤 mac，则改为在 Rust `Builder` / 窗口创建时按 `cfg(windows)` 设置，或使用平台专用配置覆盖。

### 4.2 子窗 `WebviewWindow` 选项

涉及：

- `multiAgentWindow.ts`
- `historyWindows.ts`（文件历史 / 分支历史）
- `branchManageWindow.ts`
- `branchCompareWindow.ts`

规则：

- mac：继续 `titleBarStyle: "overlay"` + `trafficLightPosition`
- win：`decorations: false`，**不**依赖 trafficLight（可省略）

抽 `createOverlayWindowOptions()`（或等价）避免五处复制分叉。

---

## 5. 前端结构

### 5.1 `useWindowChromeLayout()`

- 检测 OS：优先既有 `system_app_info.os`，或同步可读的 Tauri OS API；首帧可先按 `navigator` 兜底，水合后校正
- 返回：
  - `isMacOverlay: boolean`
  - `headerPaddingClass`：mac → `pl-[88px]`；win → `pl-2` 或 `pl-3`
  - `showWinControls: boolean`（仅 windows）

### 5.2 `WindowChromeControls`

- 仅 `showWinControls` 时渲染
- 按钮：最小化、最大化/还原、关闭
- API：`getCurrentWindow()` → `minimize` / `toggleMaximize` / `close`；订阅 `onResized` 或轮询 `isMaximized` 更新图标
- 样式：与顶栏 `size-7` ghost 按钮同高；关闭悬停可用 `destructive` 色 token（克制）
- a11y：i18n `aria-label` + Tooltip
- 整组 `WebkitAppRegion: no-drag`

### 5.3 接入

| 位置 | 改动 |
|------|------|
| `RepoTabBar` | header class 用 hook 的 padding；右侧控件槽挂载 `WindowChromeControls`；拖拽留白仍在中间 |
| 各子窗顶栏 | 去掉写死的 `pl-[88px]`，改用 hook；右侧同样挂载控件 |

拖拽规则不变：可点控件 `no-drag`；空白兄弟节点 `data-tauri-drag-region`。

### 5.4 Win 交互细则（自行裁定）

- 双击顶栏 **拖拽区**（非按钮）：`toggleMaximize`
- 不实现 Aero Snap 以外的自定义贴边（交给系统）
- 不自绘阴影以外的 Win11 圆角特例（WebView 限制则接受系统默认）

---

## 6. Capabilities

在 `default.json` 与各子窗 capability 增加窗口权限（名称以 schema 为准），至少覆盖：

- `core:window:allow-minimize`
- `core:window:allow-maximize` / `allow-unmaximize`（若分列）
- `core:window:allow-toggle-maximize`
- `core:window:allow-close`
- `core:window:allow-is-maximized`
- 已有 `allow-start-dragging` 保留

mac 多授这些权限不影响 Overlay 行为。

---

## 7. i18n

`layout` 或 `common` 域增加：

- 最小化 / 最大化 / 还原 / 关闭 的 label 与 tip（zh-CN + en）

---

## 8. 文档（硬性交付）

| 文档 | 内容 |
|------|------|
| 本文 | 设计真相源 |
| `docs/development/ui-guidelines.md` | 顶栏平台分支、拖拽、Win 三键、禁止在 mac 去掉 `pl-[88px]` |
| `docs/architecture/tauri.md` | 窗口装饰平台策略 + capabilities 列表 |
| `docs/product/feature-list.md` | Windows 无边框顶栏一行状态 |

实现计划另见：`docs/superpowers/plans/2026-07-22-windows-window-chrome.md`（若拆分）。

---

## 9. 测试要点

**mac（回归）**

- [ ] 交通灯位置与改前一致
- [ ] 标签栏左起位置仍约 88px
- [ ] 拖窗口、点标签、点「打开仓库」正常
- [ ] 子窗 Overlay 正常

**Windows**

- [ ] 无双重系统标题栏
- [ ] 三键功能正确；最大化↔还原
- [ ] 双击顶栏空白最大化/还原
- [ ] 主窗 + 多仓鲸灵 + 分支对比/管理 + 历史子窗均一致
- [ ] 标签拖拽排序、关闭仍可用

**类型 / 冒烟**

- [ ] `tsc` 通过
- [ ] 相关 capability 不导致运行时 permission deny

---

## 10. 非目标

- 不改变 Linux 专门 UX 承诺
- 不重做 TitleBar 为第二套标签系统
- 不做自定义标题栏菜单（Alt 系统菜单等）

---

## 11. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 全局 `decorations: false` 伤 mac | 平台条件配置；mac 验收清单强制 |
| 子窗漏改仍留 `pl-[88px]` | 清单枚举全部 window 工厂 + grep `pl-\[88px\]` |
| 缺 capability 导致按钮无响应 | 主窗/子窗 capability 同步改 |

---

## 12. 批准记录

- 用户选定：方案 1；范围 = 主窗 + 全部子窗；功能性差异由实现方裁定；mac 零回归  
- 设计正文批准后进入实现（用户指令：「开始」）
