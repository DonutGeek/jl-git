# 主题与 Design Tokens

> **相关文档：** [ui-guidelines](ui-guidelines.md) · [AGENTS.md](../../AGENTS.md)

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
