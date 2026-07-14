# 状态栏更新入口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在状态栏版本信息后提供默认“下载”、悬停或聚焦后显示“更新”的圆角 Tag。

**Architecture:** 在现有 `StatusBar` 内组合一个固定宽度的实心圆角 `Button`，以相对定位叠放“下载”和“更新”文本，并仅通过透明度和轻微位移完成视觉切换。所有用户可见文字通过 `statusBar.download` 与 `statusBar.update` i18n 键提供；本次不连接实际下载或安装动作。

**Tech Stack:** React 19、TypeScript、Tailwind CSS、shadcn/ui Button/Tooltip、lucide-react、react-i18next。

## Global Constraints

- 仅修改状态栏组件与中英文 i18n 资源，不新增依赖或更新后端能力。
- 入口为带文字的 Tag，不使用图标、Tooltip 或冗余的 `aria-label`。
- 颜色和交互样式使用既有 Tailwind Token 类，并支持鼠标与键盘聚焦。
- 切换不得改变状态栏布局宽度；默认与悬停/聚焦态均可读。

---

### Task 1: 补齐 Tag 文案翻译

**Files:**
- Modify: `src/i18n/locales/zh-CN.json:8-27`
- Modify: `src/i18n/locales/en.json:8-27`

**Interfaces:**
- Produces: `t("statusBar.download")` 与 `t("statusBar.update")`，中文为“下载”与“更新”、英文为“Download”与“Update”。

- [ ] **Step 1: 添加中英文下载文案键**

在两个 `statusBar` 对象中添加：

```json
"download": "下载"
```

```json
"download": "Download"
```

- [ ] **Step 2: 验证 JSON 与类型检查**

Run: `pnpm exec tsc --noEmit`

Expected: exit code 0。项目未配置前端单测脚本，本次 UI 文案变更以类型检查和运行时冒烟验证。

### Task 2: 实现固定宽度的状态栏下载 Tag

**Files:**
- Modify: `src/components/layout/StatusBar.tsx:2-11,192-200`

**Interfaces:**
- Consumes: `t("statusBar.download")`、`t("statusBar.update")`、`Button`。
- Produces: 固定宽度实心圆角 Tag，默认展示“下载”；`:hover` 或 `:focus-visible` 时展示“更新”。


- [ ] **Step 1: 在版本文案后加入下载 Tag**

将版本信息分组保留为 `flex` 容器，并在版本 `span` 后插入：

```tsx
<Button
  type="button"
  className="bg-foreground text-background hover:bg-foreground/90 group relative h-5 w-10 shrink-0 cursor-pointer overflow-hidden rounded-full px-0 text-[10px] font-semibold"
>
  <span className="pointer-events-none absolute inset-0 flex items-center justify-center transition-all duration-150 group-hover:-translate-y-0.5 group-hover:opacity-0 group-focus-visible:-translate-y-0.5 group-focus-visible:opacity-0">
    {t("statusBar.download")}
  </span>
  <span className="pointer-events-none absolute inset-0 flex translate-y-0.5 items-center justify-center opacity-0 transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
    {t("statusBar.update")}
  </span>
</Button>
```

- [ ] **Step 2: 运行类型检查**

Run: `pnpm exec tsc --noEmit`

Expected: exit code 0。

### Task 3: 执行界面冒烟验证

**Files:**
- Verify: `src/components/layout/StatusBar.tsx`

**Interfaces:**
- Verifies: “下载”Tag 与“更新”文案切换、焦点可见和无布局位移。

- [ ] **Step 1: 启动桌面开发环境**

Run: `pnpm tauri dev`

Expected: JLGit 桌面窗口启动，底部状态栏可见。

- [ ] **Step 2: 手动验证交互**

在窗口中完成：

1. 确认版本文案后显示实心圆角“下载”Tag。
2. 指针移入入口，确认“下载”在约 150ms 内淡出，“更新”淡入，左右布局不移动。
3. 指针移出后确认恢复“下载”Tag。
4. 使用 Tab 聚焦入口，确认同样显示“更新”且焦点环可见。

- [ ] **Step 3: 复核改动范围与静态检查**

Run: `git diff --check && git status --short && pnpm exec tsc --noEmit`

Expected: 无空白错误；仅计划中列出的状态栏与翻译文件发生未提交代码改动；类型检查 exit code 0。
