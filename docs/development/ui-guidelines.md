# UI 指南

> **相关文档：** [theme](theme.md) · [app-icon](app-icon.md) · [frontend](../architecture/frontend.md) · [AGENTS.md](../../AGENTS.md)

灵感来源：**GitHub Desktop、VS Code、Linear、SourceGit**。  
关键词：Minimal · Professional · Developer-first · Fast · Clean · Consistent。

---

## 总体原则

1. 信息密度适中：侧栏导航清晰，主区聚焦当前任务
2. 一层主操作 + 一层次要操作；避免工具条按钮墙
3. 用排版与留白分层，而不是重阴影与渐变
4. 所有颜色来自 Tokens（[theme](theme.md)）
5. UI 图标仅 `lucide-react`；工作区文件/目录类型图标用 `material-icon-theme`（VS Code Material Icon Theme），禁止用 lucide 冒充文件类型
6. 基础控件 **必须**用 **shadcn/ui 官方 CLI** 引入（`pnpm dlx shadcn@latest add <name>`）；禁止手写 / 私改 `src/components/ui/`
7. 宽高 / 间距 / 圆角等尺寸**尽量使用 Tailwind 内置尺度**（见下节），避免随意 `w-[140px]` 一类任意值

---

## Tailwind 尺寸（硬性偏好）

布局与控件尺寸优先走 Tailwind 默认 spacing / sizing 阶梯（如 `w-28`、`max-w-60`、`h-7`、`gap-1.5`、`p-1.5`），与 [theme · 间距与字体](theme.md#间距与字体) 一致。

| 偏好 | 说明 |
|------|------|
| 优先 | `w-28`、`w-44`、`max-w-60`、`min-w-0`、`h-7`、`h-8` 等内置类 |
| 避免 | 无必要的任意像素：`w-[140px]`、`max-w-[180px]`、`h-[28px]` |
| 可接受例外 | 视口复合约束（如 `max-w-[min(360px,calc(100vw-24px))]`）、与外部规范对齐的固定稿、无法用阶梯表达的数学表达式 |

选型时取**最接近**的内置档位即可（例如约 110–112px → `w-28`，240px → `w-60` / `max-w-60`），不必为「刚好 N px」开任意值。颜色仍只用 Design Tokens，禁止硬编码色值。

---

## 前省略 + 悬停展开（硬性）

表格内长路径 / 分支名等「前省略 + 悬停看全文」**优先**用 `@/components/common/TruncateStartHoverLabel`，不要每次手拼 flex。

| 规则 | 说明 |
|------|------|
| 预算与视觉拆开 | 外层挂 `TRUNCATE_BUDGET_ATTR` 占满列宽；内层 `w-max max-w-full` |
| 禁止 | 给内层壳加 `flex-1`（后缀徽章会被顶到列尾） |
| 同壳 | `leading` / 文案 / `trailing`（如「默认」徽章）必须同一 flex 壳，量宽才能扣除徽章 |
| 悬停展开 | Tooltip 展示全文；宽触发器**禁止** `align="start"`（否则 Floating UI 隐藏箭头） |
| 虚拟列表 | 行定位优先用 `top: start`，**避免**行上 `transform: translateY`（会导致浮层锚点漂到列表顶） |

仅「可点复制路径」继续用 `CopyablePathLabel`；分支管理表等只读展开用 `TruncateStartHoverLabel`。

---

## 长标识符换行（硬性）

路径、分支名、远端 ref 等英文标识符**禁止**用 `break-all` 按字母硬断（会出现 `activit` / `y`）。

| 规则 | 说明 |
|------|------|
| 优先 | `withSoftWrapOpportunities`（`@/utils/softWrapText`）在 `/` `\` `&` `.` `_` `-` 后插入零宽换行点 |
| 样式 | 配合 `break-words`（或 `wrap-break-word`）；仅当整段无分隔且仍溢出时才允许末端折断 |
| 复制 | 剪贴板必须用原始字符串，勿从带零宽空格的 DOM 文案复制 |
| 例外 | 连续无分隔的超长串（如整段公钥）仍可能在行宽不足时折断，属兜底 |

---

## shadcn/ui

JLGit 以 [shadcn/ui](https://ui.shadcn.com/) 作为基础组件来源（代码生成进仓库，而非运行时依赖整包 UI 库）。

| 资源 | 链接 |
|------|------|
| 官网 / 文档 | https://ui.shadcn.com/ |
| 组件目录 | https://ui.shadcn.com/docs/components |
| 安装与 CLI | https://ui.shadcn.com/docs/cli |
| 主题 / CSS Variables | https://ui.shadcn.com/docs/theming |

本仓库已配置 `components.json`（style: `new-york`，输出目录 `@/components/ui`，图标 `lucide`）。

### 选型优先级（硬性）

**能用 shadcn 就尽量用 shadcn**，禁止业务层再手搓一套等价基础控件。

| 场景 | 做法 |
|------|------|
| 官方有同名/等价组件 | **必须**用 `@/components/ui/*`（先查下表与 [组件目录](https://ui.shadcn.com/docs/components)） |
| 常见叫法对照 | 「Tag / 标签 / 胶囊状态」→ **`Badge`**；「开关」→ **`Switch`**；「抽屉」→ **`Sheet`**；「表格」→ **`Table`** |
| 仓库尚未引入 | `pnpm dlx shadcn@latest add <name>` 引入后再用，**禁止**用原生标签或手写仿造冒充 |
| 官方没有、且属领域 UI | 放 `components/common` 或各域目录，**不要**塞进 `ui/` |
| AI / 贡献者 | 写 UI 前先搜 `src/components/ui/` 与官方文档；缺件先 CLI，再写业务 |

### 本仓库已引入（`src/components/ui/`）

| 组件 | 文件 |
|------|------|
| Alert | `alert.tsx` |
| Alert Dialog | `alert-dialog.tsx` |
| Avatar | `avatar.tsx` |
| Badge | `badge.tsx` |
| Button | `button.tsx` |
| Button Group | `button-group.tsx` |
| Calendar | `calendar.tsx` |
| Card | `card.tsx` |
| Checkbox | `checkbox.tsx` |
| Command | `command.tsx` |
| Context Menu | `context-menu.tsx` |
| Dialog | `dialog.tsx` |
| Dropdown Menu | `dropdown-menu.tsx` |
| Empty | `empty.tsx` |
| Field | `field.tsx` |
| Input | `input.tsx` |
| Item | `item.tsx` |
| Kbd | `kbd.tsx` |
| Label | `label.tsx` |
| Popover | `popover.tsx` |
| Radio Group | `radio-group.tsx` |
| Resizable | `resizable.tsx` |
| Scroll Area | `scroll-area.tsx` |
| Select | `select.tsx` |
| Separator | `separator.tsx` |
| Sheet | `sheet.tsx` |
| Skeleton | `skeleton.tsx` |
| Sonner | `sonner.tsx` |
| Spinner | `spinner.tsx` |
| Switch | `switch.tsx` |
| Table | `table.tsx` |
| Tabs | `tabs.tsx` |
| Textarea | `textarea.tsx` |
| Tooltip | `tooltip.tsx` |

Toast 统一使用 shadcn 官方 Sonner 方案：

- 通过 `pnpm dlx shadcn@latest add sonner` 引入 `src/components/ui/sonner.tsx`，禁止继续使用已弃用的 Toast / Toaster / `useToast`
- 应用根节点从 `@/components/ui/sonner` 引入 `Toaster`；业务调用按官方用法从 `sonner` 引入 `toast`
- `Toaster` 必须接入 JLGit 的 `light` / `dark` / `system` 主题模式，颜色继续使用生成组件映射的 Design Tokens
- Toast 正文、操作按钮与可访问文本必须走 i18n，并同时维护 `zh-CN`、`en`

> CLI 提示：若本机 `pnpm dlx shadcn@latest` 因 zod / MCP SDK 报 `Package subpath './v3' is not defined` 或 `Package subpath './v4' is not defined`，可在临时目录安装 `shadcn@latest` + `zod@3.25.76` 后执行 `./node_modules/.bin/shadcn add <name> --yes --cwd <项目根>`。依赖组件若提示覆盖已有文件，加 `--overwrite`。

### 官方有、本仓库尚未引入（摘录）

对照 [All Components](https://ui.shadcn.com/docs/components)。**不默认全量 `add`**：全量会引入大量未用 Radix/图表/日历依赖，违背项目 YAGNI（见 [AGENTS.md](../../AGENTS.md) §4 / §9）。缺什么加什么；常用缺口优先：

| 优先级 | 组件 | 典型用途 |
|--------|------|----------|
| 中 | `progress` / `collapsible` / `toggle` / `toggle-group` | 进度、折叠、工具条切换 |
| 中 | `combobox` / `input-group` | 命令面板与增强输入 |
| 低 / 按需 | `calendar`、`chart`、`carousel`、`sidebar`、`menubar`、`navigation-menu`、`pagination`、`drawer`、会话类 `message` / `bubble` 等 | 有明确产品需求再引入 |

完整未引入列表随时可用：

```bash
# 本地已有
ls src/components/ui | sed 's/\.tsx$//'

# 对照官方目录：https://ui.shadcn.com/docs/components
```

若产品明确要求「预置全量 ui」，须单独批准后再执行（例如按批 `pnpm dlx shadcn@latest add …`），并在 PR 中说明依赖增量。

### 按需引入（硬性）

需要 Dialog、Dropdown、Tabs、Tooltip、Command、Spinner、**Badge / Table** 等时，**必须**用官方 CLI **按需添加**。与 [AGENTS.md §15 / Never Rules §14](../../AGENTS.md) 一致：

| 要求 | 说明 |
|------|------|
| 必须 | `pnpm dlx shadcn@latest add <component>`（更新/恢复加 `--overwrite`） |
| 禁止手写 | 不得在 `src/components/ui/` 手写、粘贴 registry、或用 Agent 工具仿造官方文件 |
| 禁止私改 | 不得改 `ui/` 内样式/结构/导出；业务只组合引用 |
| 禁止自动改写 | ESLint / Prettier / 编辑器 format-on-save 均不得改写该目录（见 [code-quality-tooling](code-quality-tooling.md)） |
| CLI 失败 | 修环境后重试官方命令，**禁止**退化为手写落地 |

```bash
pnpm dlx shadcn@latest add button
pnpm dlx shadcn@latest add dialog
pnpm dlx shadcn@latest add dropdown-menu
pnpm dlx shadcn@latest add spinner
pnpm dlx shadcn@latest add badge
pnpm dlx shadcn@latest add table
pnpm dlx shadcn@latest add sonner
# 其余组件名见官方组件目录
```

其它规则：

1. `src/components/ui/` **只**存放官方 CLI 生成件
2. 业务组件（`components/git` 等）**组合** ui 层，不复制、不改写 ui 源码
3. **默认按需添加**；避免无产品批准的一次性全量 `add`
4. 新增官方组件若引入额外 Radix / 依赖，在 PR 中说明用途；仍遵守「不引入第二套 UI 体系」
5. 官方没有、且属于领域 UI 的控件，放 `components/common` 或对应域目录，而不是硬塞进 `ui/`

### 滚动区域（硬性）

面板主滚动**必须**使用 `@/components/ui/scroll-area`（shadcn `ScrollArea`），与 [AGENTS.md §15 / Never Rules](../../AGENTS.md) 一致。

| 要求 | 说明 |
|------|------|
| 组件 | `import { ScrollArea } from "@/components/ui/scroll-area"` |
| 禁止 | 以裸 `overflow-auto` / `overflow-x-auto` / `overflow-y-auto` 作为列表、侧栏、主内容区的交付滚动方案 |
| 滚动条 | 默认悬停/滚动可见；不设 `type="always"` |
| 高度链 | Root 用 `h-full` / `flex-1 min-h-0`；**禁止**在 ScrollArea Root 上用 `absolute` 定高（会弄坏 viewport） |
| 虚拟列表 | 大列表另加 `@tanstack/react-virtual`，`getScrollElement` 绑 Radix viewport（见 [performance](performance.md)、`useScrollAreaViewport`） |
| 局部裁切 | `overflow-hidden` 仅用于裁切/叠层，不代替可滚动面板 |

例外：极短的调试对照、或非交互装饰性裁切。History 图谱列等横向溢出也走 `ScrollArea`（可配合 `overflow-y-hidden` 仅保留横轴）。

---

## 布局骨架

```
┌──────────────────────────────────────────────┐
│ Header（仓库名 / 分支 / 全局操作）              │
├────────────┬─────────────────────────────────┤
│ Sidebar    │ Main                             │
│ 导航/文件  │ Toolbar                          │
│            │ Content（列表 / Diff / 表单）     │
│            │                                  │
└────────────┴─────────────────────────────────┘
```

- **Dashboard**：无仓库侧栏时，用项目网格/列表 + 最近
- **Repo**：左导航（Changes / History / Branches…）+ 主区

---

## Header

- 高度紧凑（约 40–48px）
- 左：仓库名、当前分支切换
- 右：Fetch / Pull / Push、更多菜单
- 不放营销文案或大 Logo 墙

---

## Sidebar

- 背景 `--sidebar`，右边框 `--sidebar-border`
- 激活项：清晰但不刺眼的 `accent`
- 可拖拽调宽；宽度写入设置
- 文件列表：状态色点 + 路径；长路径中间省略

---

## Toolbar

- 主区顶部一条；分组：选择操作 | 视图切换 | 溢出菜单
- 主按钮最多一个 Primary（如 Commit）
- 危险操作（Discard）用 destructive，且需确认

---

## 按钮

| 变体 | 场景 |
|------|------|
| Primary | 提交、确认主流程 |
| Secondary / Outline | 次要 |
| Ghost | 工具条图标、密集区 |
| Destructive | 删除、丢弃 |

- 图标按钮必须有 `aria-label` 或 Tooltip
- 加载态：禁用 + spinner，防止重复提交

---

## 输入

- 统一高度与 `--radius-md`
- Commit message：主输入用 textarea；标题/正文可分（产品决定）
- 校验错误：输入框下短文案，红色用 `--destructive`

---

## 表格与列表

- 提交历史、分支表：TanStack Table 可选
- 大列表：TanStack Virtual
- 行悬停态轻量；选中态明确
- 数字/hash 等宽字体

---

## 对话框

- 用于：确认危险操作、创建分支、设置片段
- 焦点陷阱、Esc 关闭、主按钮明确
- 完整应用设置用右侧 **Sheet 抽屉**（保留当前仓库工作区），不要用 Dialog 堆完整设置；也不强制跳转 `/settings` 路由页
- 业务弹窗统一组合 `@/components/common/AppDialogContent`，禁止在各业务模块重复定义 `gap`、`padding`、标题字号与圆角
- 普通编辑/创建使用 `AppDialogContent`；需要用户确认后才执行的操作使用 `AppAlertDialogContent` + shadcn `AlertDialog`
- 宽度按信息量选择 `sm` / `md` / `lg` / `xl` / `2xl`，默认 `md`；同类任务必须使用同一档位
- 表单字段纵向间距统一为 `gap-4`；按钮区使用 `DialogFooter` / `AlertDialogFooter`，取消在前、主操作在后
- 危险操作的主按钮必须使用 `destructive`，并在描述中明确影响范围与是否可恢复

### 弹窗尺寸与用途

| 尺寸 | 用途 | 示例 |
|------|------|------|
| `sm` | 单字段、轻量重命名 | 标签别名、会话重命名 |
| `md` | 常规创建/编辑与确认 | 新建分支、Git 账号、删除确认 |
| `lg` | 多字段详情或长文本 | 项目详情、提交信息编辑 |
| `xl` / `2xl` | 需要列表、对比或预览的复杂任务 | 分支对比 |

全屏式目录选择器、插件目录等复合工作区可保留 `p-0` 的专用布局，但其标题、关闭方式与焦点行为仍须遵循同一对话框规范。

---

## 设置抽屉

- 入口：活动栏底部「设置」
- 形态：`Sheet` `side="right"`，遮罩可点关闭，Esc 关闭
- 分组：外观 / Git / 通知…；内容增多时可在抽屉内加左侧小导航
- 瞬时开合状态进 Zustand，不进 URL

---

## Diff

- 增删行使用 `--diff-add` / `--diff-del`
- 可切换 unified / split（实现阶段）
- 二进制文件明确提示，不尝试渲染乱码
- 超大 patch 截断并提示（与 `git_diff` 的 `truncated` 对齐）

---

## 空状态与错误

- 空状态：一句话 + 一个主操作（如「添加仓库」）
- 错误：可读、可重试；技术细节折叠或仅日志
- 加载中：骨架或短文案，避免空白闪烁；异步按钮禁用防重复提交
- 成功反馈：短 toast；破坏性操作成功也要可感知

---

## 动效预算

- 允许 2–3 种全局一致的过渡（侧栏、对话框、toast）
- 列表重排可用轻量 layout 动画；默认关闭花哨
- 颜色 / 透明度过渡优先 `transition-colors`（约 150–200ms）
- 分隔线悬停、图标激活态必须有视觉变化，不可「点了没反应」

---

## 用户体验硬规则（JLGit 特别重视）

本产品是**工具型桌面客户端**，体验对标 GitHub Desktop / VS Code / Linear。下列细节**不是可选项**，实现与 Code Review 时必须检查。

### 1. 纯图标必须可理解

| 要求 | 说明 |
|------|------|
| Tooltip | 无文字的图标按钮悬停必须出现 Tooltip（shadcn `Tooltip`），文案走 i18n |
| aria-label | 与 Tooltip 文案一致，保证键盘与读屏 |
| 延迟 | 默认约 300ms，避免鼠标划过刷屏 |
| 位置 | 活动栏靠右；顶栏靠下；不遮挡关键内容 |

**禁止**：仅靠「大家应该认识这个图标」省略提示。

### 2. 交互反馈

| 交互 | 期望 |
|------|------|
| 悬停 | 可点控件有背景/颜色变化；分隔线悬停变色加粗（不改布局占位） |
| 光标 | 见下表「光标约定」；悬停即可从光标判断能否点、能否拖 |
| 点击 / 按下 | 激活态明确（`aria-pressed` / 选中背景）；主按钮有禁用与加载态 |
| 双击 | 若支持（如打开文件、checkout），必须与单击区分，并在文档/注释标明 |
| 拖拽 | 分隔线悬停即 `col-resize` / `row-resize`；拖拽中保持高亮；**悬停加粗不得改变布局占位宽度**；**拖拽结束后若残留 focus，不得继续高亮整条线**（仅 hover/active 高亮，focus 用细环） |
| 焦点 | 键盘可达；可见 focus ring（勿 `outline-none` 后不补替代样式） |

### 2.1 光标约定（必须）

| 区域 / 控件 | 光标 | 说明 |
|-------------|------|------|
| 按钮、可点击列表行、标签、活动栏图标 | `cursor-pointer` | 明确「可点」 |
| 禁用按钮 / 不可点 | `cursor-not-allowed` 或保持默认且无 pointer | 与 `disabled` 一致 |
| 异步进行中（整行打开中） | `cursor-wait` 可选用 | 防重复点 |
| 面板分隔线（左右拖） | `cursor-col-resize` | 悬停即显示，不必等按下；**全部**可拖分栏用 shadcn Resizable：双栏走 `ResizableSplit`，特殊布局（如历史图谱列）直接组合 `ResizablePanelGroup` + `ResizableHandle`，手柄样式统一用 `RESIZABLE_HANDLE_CLASSNAME`（禁止改 `ui/resizable`、禁止自绘 pointer 分隔） |
| 面板分隔线（上下拖） | `cursor-row-resize` | 同上 |
| 文本输入 / 可选中正文 | `cursor-text`（浏览器默认即可） | 勿强行 pointer |
| 仅展示、暂不可点的列表行 | `cursor-default` | 可有轻悬停底，但不要假 pointer |
| 顶栏仓库标签 | 整标签拖拽排序（无独立手柄，Chrome/VS Code 惯例）；关闭按钮在右侧且不参与拖拽；间距紧凑统一 `gap-1` |

### 2.2 窗口顶栏 / 平台分支（必须）

| 平台 | 行为 |
|------|------|
| macOS | `tauri.macos.conf.json`：Overlay + 交通灯；顶栏 `pl-[88px]`；**禁止**去掉留白或 `decorations: false` |
| Windows / Linux | `decorations: true`（系统标题栏与窗口按钮）；顶栏左侧 `pl-3`，不挂自绘三键，不显示 Tauri 应用菜单行 |
| 拖拽 | **仅 mac Overlay** 空白区 `data-tauri-drag-region`；可点控件 `WebkitAppRegion: no-drag`。Win/Linux 用系统标题栏拖移，**禁止**自绘区挂 drag-region（避免 IPC `startDragging` 前摇） |
| 复用 | 子窗顶栏用 `AppWindowHeader`；布局判断用 `useWindowChromeLayout` |

设计见 [windows-window-chrome](../superpowers/specs/2026-07-22-windows-window-chrome-design.md) · [official-three-platform](../superpowers/specs/2026-07-22-official-three-platform-design.md)。

**禁止**：可点区域悬停仍是箭头；可拖分隔线悬停仍是箭头；用改布局宽度制造「加粗」反馈。

### 2.3 右键菜单（硬性）

全应用 Context Menu（及与之同构的行内「⋯」Dropdown）必须共用同一套**分组顺序、图标与危险项样式**。禁止同一动作在 A 处排第一、B 处排第二，或图标/文案各写一套。

自上而下固定分组（无内容的组整组省略；分隔线只出现在有内容的组之间）：

| 顺序 | 分组 | 示例 |
|------|------|------|
| 1 | **主操作** | 打开、Checkout、Stage/Unstage、新建… |
| 2 | **编辑** | 重命名、别名、Amend、Pin… |
| 3 | **复制** | 多个复制项收入「复制」子菜单；仅一项时可平铺 |
| 4 | **导航 / 历史** | 文件历史、在目录树中显示、查看标签历史… |
| 5 | **系统打开** | ≥2 项时收入「打开方式」子菜单；子项顺序见下 |
| 6 | **同步** | Pull / Push / Publish / Fetch… |
| 7 | **危险** | 删除、丢弃、从应用移除… |

**系统打开**（`repo.openVia`「打开方式」子菜单；触发项图标 `ExternalLink`；缺项跳过，不打乱相对序）：

1. 在访达 / 资源管理器中显示 — 图标一律 `FolderOpen`
2. 在编辑器中打开 — `ExternalLink`
3. 在终端中打开 — `Terminal`
4. （可选，仓库级）在浏览器中打开远程 — `Globe`（SSH/`git@` 转 https；无远端或无法转换则 toast）
5. （可选）用系统关联应用打开本地路径 — `AppWindow`

仅剩 1 项时可平铺，不必套子菜单。

**新建类**固定顺序：先「添加空目录」`FolderPlus`，后「添加新文件」`FilePlus`。

**其它硬规则：**

| 规则 | 说明 |
|------|------|
| 图标 | 同类动作全局同图标；有图标的菜单勿出现「一半有一半无」 |
| 危险项 | 一律置底；用 `variant="destructive"`；删除类优先 `Trash2`（远端删标签可用 `CloudOff`） |
| 文案 | 能共用 i18n key 就共用（如 `common.copy`、`repo.openInEditor`）；平台访达文案用 `revealInFileManagerLabel` |
| 同构菜单 | 单仓/多仓会话等平行入口，结构与图标必须一致 |

参考实现：`ProjectContextMenu`、`FileTreeContextMenu`、`ChangeFileContextMenu`、`RepoTabItem`。

### 3. 加载与异步

- 切换仓库：保留顶栏/工具栏/分栏壳，只刷新 Git 数据；禁止用整页 loading 替换导致「闪一下」
- 首屏 / 切仓库：首次进入可整页占位；标签切换用轻量遮罩或面板内空态，不拆壳
- 列表懒加载（目录树展开）：节点内短占位（如 `…`），失败可重试或 toast
- 写操作（stage / commit / checkout）：按钮 `disabled` + 文案或 spinner；失败 toast，成功短提示

### 4. 空状态

- 每个主面板（最近项目、变更、分支、历史、目录树）都要有空状态文案
- 空状态优先给**一个**明确下一步（打开仓库、暂存、切换分支等）
- 区分「真的空」与「加载失败」

### 5. 过渡与动效

- 面板切换、对话框开关、Tooltip 出现：短淡入/缩放即可
- 不使用夸张弹跳、长时动画、干扰阅读的动效
- 布局宽度变化跟手；记住用户拖拽结果（localStorage / 设置）

### 6. 文案与 i18n

- 用户可见文案（含 Tooltip、空状态、toast、aria-label）一律走 i18n
- 品牌名 `JLGit` 可硬编码；路径、分支名、hash 等数据不翻译
- 资源按语言分目录、按域分文件：`src/i18n/locales/<lng>/<domain>.json`，由该语言目录下的 `index.ts` 合并；新增域时同步补齐 `zh-CN` 与 `en`，并在两侧 `index.ts` 注册

### 7. 验收清单（功能合入前）

- [ ] 所有纯图标按钮有 Tooltip + `aria-label`
- [ ] 悬停 / 激活 / 禁用态可区分；**光标符合约定**（可点 pointer、分隔线 col/row-resize）
- [ ] 空状态与加载态已覆盖主路径
- [ ] 异步操作有防重复与错误提示
- [ ] 分隔线悬停有视觉反馈且**不挤动布局**
- [ ] 面板主滚动使用 shadcn `ScrollArea`（无裸 `overflow-*-auto` 交付）
- [ ] 新增/更新 `src/components/ui/` 仅经官方 `pnpm dlx shadcn@latest add …`（无手写、无私改）
- [ ] 无硬编码产品文案（除品牌名）
- [ ] 右键菜单分组顺序 / 系统打开顺序 / 危险项样式符合 §2.3

---

## 反模式

- 英雄区营销布局套在工具型 App
- 卡片套卡片
- 紫粉渐变主题、玻璃光晕堆叠
- 同一屏多个 Primary 按钮争夺注意力
- 纯图标无提示、点击无反馈、空面板无说明
- 可点区域光标仍是默认箭头；可拖分隔线无 `col-resize`
- 悬停加粗导致内容左右抖动
- 为「炫技」加入与任务无关的长动画
- 右键菜单同类动作顺序/图标不一致（违反 §2.3）
