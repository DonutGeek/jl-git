# 冲突文件操作栏实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将冲突文件的整文件操作从路径行移到新增的独立提示操作行。

**Architecture:** 保持 `ChangesPreviewPane` 作为整文件冲突操作的唯一宿主，仅调整 JSX 布局；`ConflictFilePreview` 的 imperative handle 和编辑器内逐块冲突操作不变。新增提示文案进入现有 `repo` 中英文资源。

**Tech Stack:** React 19、TypeScript、Tailwind CSS 4、shadcn/ui、i18next

## Global Constraints

- 非冲突文件布局保持不变。
- 不修改 `src/components/ui/**`。
- 不新增依赖。
- 不添加测试文件；按项目当前约定使用质量检查、生产构建和运行时冒烟验证。

---

### Task 1: 拆分冲突路径行与操作行

**Files:**
- Modify: `src/components/git/ChangesPreviewPane.tsx`

**Interfaces:**
- Consumes: `conflictPreviewRef`, `conflictBusy`, `oursLabel`, `theirsLabel`
- Produces: 仅在 `statusConflict` 时渲染的独立冲突操作行

- [ ] **Step 1: 从路径行移除整文件按钮**

保留路径行中的状态、冲突图标、文件图标和 `CopyablePathLabel`，删除路径标签后的 `statusConflict` 按钮容器。

- [ ] **Step 2: 在路径行后增加冲突操作行**

```tsx
{statusConflict ? (
  <div
    className="border-border flex h-8 shrink-0 items-center justify-between gap-3 border-b px-2"
    role="region"
    aria-label={t("repo.conflictWarning")}
  >
    <p className="text-muted-foreground min-w-0 truncate text-xs">
      {t("repo.conflictPreviewActionHint")}
    </p>
    <div className="flex shrink-0 items-center gap-1">
      {/* 移入现有三个 Button，事件、禁用状态与文案保持不变 */}
    </div>
  </div>
) : null}
```

- [ ] **Step 3: 保持按钮行为不变**

继续调用：

```tsx
void conflictPreviewRef.current?.take("ours");
void conflictPreviewRef.current?.take("theirs");
void conflictPreviewRef.current?.markResolved();
```

三个按钮继续使用 `disabled={conflictBusy}`。

### Task 2: 增加中英文提示

**Files:**
- Modify: `src/i18n/locales/zh-CN/repo.json`
- Modify: `src/i18n/locales/en/repo.json`

**Interfaces:**
- Produces: `repo.conflictPreviewActionHint`

- [ ] **Step 1: 添加中文文案**

```json
"conflictPreviewActionHint": "检测到合并冲突，可逐块处理或选择整文件版本"
```

- [ ] **Step 2: 添加英文文案**

```json
"conflictPreviewActionHint": "Merge conflicts detected. Resolve them individually or choose a whole-file version."
```

### Task 3: 验证

**Files:**
- Verify: `src/components/git/ChangesPreviewPane.tsx`
- Verify: `src/i18n/locales/zh-CN/repo.json`
- Verify: `src/i18n/locales/en/repo.json`

- [ ] **Step 1: 检查 IDE 诊断**

确认修改文件无新增 TypeScript、ESLint 或 Tailwind 错误。

- [ ] **Step 2: 运行质量检查**

Run: `pnpm check`

Expected: exit code 0。

- [ ] **Step 3: 运行生产构建**

Run: `pnpm build`

Expected: exit code 0。

- [ ] **Step 4: 运行冲突文件冒烟**

在现有 Tauri 开发窗口打开一个冲突文件，确认：

- 路径独占第一行；
- 提示和三个整文件按钮位于第二行；
- 文件/差异工具栏位于第三行；
- 三个按钮可执行且忙碌时禁用；
- 非冲突文件没有新增空行。
