# 主题与 Design Tokens

> **相关文档：** [ui-guidelines](ui-guidelines.md) · [app-icon](app-icon.md) · [AGENTS.md](../../AGENTS.md)

颜色、圆角、阴影、间距的**唯一数值源**是 CSS Variables。组件禁止写死 `#rrggbb` / `rgb()` 业务色。

---

## 模式

| 模式 | 行为 |
|------|------|
| `light` | 固定浅色 |
| `dark` | 固定深色 |
| `system` | 跟随 OS 昼夜 |

实现：在 `<html>` 切换 `.dark` / `data-theme`，并同步 `colorScheme`。`system` 监听 `prefers-color-scheme`。

---

## Token 分层

```
原始色板（可选，仅 styles 内部）
  → 语义 Token（组件使用）
    → 组件变体（antdv-next Token / Tailwind class）
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

具体色值在 [`src/design/tokens.css`](../../src/design/tokens.css) 中定义（浅/深对齐 antdv-next 默认 Token）；Tailwind 映射见 `theme-map.css`；本文锁定**名称与用途**，改值不改名。

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

## 与 antdv-next

**样式主题以 antdv-next 为源**：`ConfigProvider` 使用 `defaultAlgorithm` / `darkAlgorithm` + `cssVar`，组件走 Ant Design Token（主色 `#1677ff` 等）。

业务 Tailwind 语义色（`--background`、`--primary` 等）在 `tokens.css` 对齐同一套默认浅/深色；`.ant-app` 内进一步映射 `--ant-*`，避免再把 CSS 变量反向灌进 ConfigProvider。

Git / Diff / 语法高亮为领域色，antd 没有等价 Token，仍定义在 `tokens.css`。

组件用法见 [ui-guidelines · antdv-next](ui-guidelines.md#antdv-next)。

---

## 运行时切换

```
settings 昼夜模式
  → useThemeStore / ThemeService
    → html.dark + ConfigProvider algorithm
```

见 [api/settings](../api/settings.md)。`colorScheme` 与 `.dark` 同步，使原生控件（滚动条等）跟昼夜。

### 控件与主题

业务层选择器优先领域封装（outline + `border-input` + focus `ring`，选中项 `bg-accent`）。勾选框用 antdv-next `Checkbox`，筛选框用 `Input`；**禁止**再落原生 `<select>` / `<input type="checkbox">` 作为产品控件。
