# 主题与 Design Tokens

> **相关文档：** [ui-guidelines](ui-guidelines.md) · [app-icon](app-icon.md) · [AGENTS.md](../../AGENTS.md)

颜色、圆角、阴影、间距的**唯一数值源**是 CSS Variables。组件禁止写死 `#rrggbb` / `rgb()` 业务色。

---

## 模式

| 模式 | 行为 |
|------|------|
| `light` | 固定浅色 |
| `dark` | 固定深色 |
| `system` | 跟随 OS |

实现：在 `<html>`（或根节点）切换 `.dark` / `data-theme`，与 Tailwind 约定一致。

---

## Token 分层

```
原始色板（可选，仅 styles 内部）
  → 语义 Token（组件使用）
    → 组件变体（CVA / class）
```

组件只引用语义 Token。

---

## 语义色（目标）

| Token | 用途 |
|-------|------|
| `--background` | 应用底 |
| `--foreground` | 主文字 |
| `--card` / `--card-foreground` | 表面 |
| `--muted` / `--muted-foreground` | 次要文字/底 |
| `--border` | 边框 |
| `--input` | 输入边框 |
| `--ring` | 焦点环 |
| `--primary` / `--primary-foreground` | 主按钮 |
| `--secondary` / `--secondary-foreground` | 次按钮 |
| `--accent` / `--accent-foreground` | 悬停强调 |
| `--destructive` / `--destructive-foreground` | 危险操作 |
| `--success` | 成功/同步完成 |
| `--warning` | 警告 |
| `--sidebar` / `--sidebar-foreground` / `--sidebar-border` | 侧栏 |
| `--diff-add` / `--diff-del` / `--diff-hunk` | Diff 着色 |

Git 状态色：

| Token | 语义 |
|-------|------|
| `--git-added` | 新增 |
| `--git-modified` | 修改 |
| `--git-deleted` | 删除 |
| `--git-renamed` | 重命名 |
| `--git-untracked` | 未跟踪 |
| `--git-conflict` | 冲突 |

具体 OKLCH 值在 [`src/design/tokens.css`](../../src/design/tokens.css) 中定义；Tailwind 映射见 `theme-map.css`；本文锁定**名称与用途**，改值不改名。

入口：`src/index.css` → `@import "./design/index.css"`。

---

## 圆角

| Token | 典型用途 |
|-------|----------|
| `--radius-sm` | 徽章、小控件 |
| `--radius-md` | 按钮、输入框 |
| `--radius-lg` | 卡片、对话框 |

避免到处 `rounded-full` 药丸，除非是真正的圆形图标按钮。

---

## 阴影

| Token | 用途 |
|-------|------|
| `--shadow-sm` | 轻微抬升 |
| `--shadow-md` | 下拉/弹出 |

原则：少阴影；靠边框与层次，不靠多层光晕。

---

## 间距与字体

- 间距走 Tailwind 间距尺度（4 的倍数），页面边距一致
- **宽高 / max-width 等同理**：优先 `w-*` / `max-w-*` / `h-*` 内置档位，避免随意 `w-[Npx]`；细则与例外见 [ui-guidelines · Tailwind 尺寸](ui-guidelines.md#tailwind-尺寸硬性偏好)
- 字体：系统 UI 栈或项目选定的开发者友好字体；**等宽**用于 commit hash、路径、diff
- 字号阶梯：`text-xs` 辅助 → `text-sm` 正文 → `text-base` 标题；避免过多标题层级

---

## 动画

- 使用克制的 transition（150–200ms）
- 允许：面板展开、路由淡入、列表项轻微
- 禁止：花哨弹跳、渐变泛滥、无意义循环动画
- 库：可用 `motion`，但默认 CSS transition 优先

---

## 与 shadcn

shadcn/ui 的 CSS 变量命名与上表对齐；新增 Token 先改 `styles`，再改组件。  
官方主题说明：https://ui.shadcn.com/docs/theming  
按需添加组件：见 [ui-guidelines · shadcn/ui](ui-guidelines.md#shadcnui)。

---

## 运行时切换

```
settings theme.mode
  → useSettingsStore / ThemeService
    → 应用 class
      → 可选写入 settings 表
```

见 [api/settings](../api/settings.md)（Theme 也可作为 Settings 的一部分，不强制独立 Command）。

### 应用主题（整站 + Monaco）

| 项 | 说明 |
|----|------|
| 入口 | 设置 → 外观 →「应用主题」 |
| 主题包 | **鲸灵 Git**（默认 tokens 原色，可微调）/ GitHub / ChatGPT / Claude / VS Code |
| 作用 | 非 native 包完整写入背景、卡片、弹层、次要区、侧栏、选中态、图表、仓库分组、Git/Diff Tokens，并同步关键字、字符串、注释、数字、类型、函数等 Monaco 语法色；鲸灵 Git 始终保留 `tokens.css` 与原生 Monaco 风格，只增量覆盖用户实际修改项 |
| 昼夜 | 仍跟 `html.dark`；切换主题包会重置自定义色 |
| 偏好 | `appThemeId` + `themeChromeLight` / `themeChromeDark` |
| 自定义 | 强调、背景、前景、卡片/弹层、次要背景/文字、边框、侧栏、选中态、危险操作、Diff 与 Git 状态色；应用内 Popover 提供 HSV 连续色域、色相、主题建议色与任意 HEX，浅/深模式分别实时预览并自动保存 |
| 代码 | 模块化目录 `src/design/themes/`（见 [应用主题模块](../superpowers/specs/2026-07-22-app-themes-modular-design.md)） |
| 首屏 | `applyAppThemeToDocument` 写入 `localStorage` 键 `jlgit-app-theme-boot`；`index.html` 内联脚本在 paint 前同步 `data-app-theme` / Token 快照，避免冷启动闪「原色」 |
| 启动壳 | `#app-loading` 仅同色底 + 小转圈（无文案）；`background`/`color`/`--primary` 跟 boot Token，无快照时按 `.dark` 回退 |
| `colorScheme` | 与 `.dark` 同步设置 `html.style.colorScheme`，使原生控件（滚动条等）跟昼夜 |

新增主题：新建 `packs/<name>.ts` → 挂到 `packs/index.ts` → 扩 `AppThemeId` → i18n。**禁止**把色板堆进 `apply-*` 或设置组件。色板来源见 `src/design/themes/packs/SOURCES.md`。

### 控件与主题

业务层选择器优先 `SelectMenu` / `GitRefPicker`（outline + `border-input` + focus `ring`，选中项 `bg-accent`）。勾选框用 shadcn `Checkbox`，筛选框用 `Input`；**禁止**再落原生 `<select>` / `<input type="checkbox">` 作为产品控件。
