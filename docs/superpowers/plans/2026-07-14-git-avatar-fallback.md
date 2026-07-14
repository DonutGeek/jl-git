# Git 身份头像默认回退图标 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在未获得公开 Git 头像时显示默认用户图标，而非用户名缩写。

**Architecture:** 只调整共享的 `GitIdentityAvatar` 回退渲染分支。远程 Libravatar 的 URL 生成与加载失败状态不变，所有使用该组件的区域将自动获得一致行为。

**Tech Stack:** React 19、TypeScript、lucide-react、shadcn Avatar、Tailwind CSS。

## Global Constraints

- 不新增依赖或网络请求。
- UI 图标仅使用 `lucide-react`。
- 保留既有 `aria-label`、Tooltip 文字与尺寸类名。
- 项目未配置单元测试运行器；本改动以 `pnpm exec tsc --noEmit` 与 Tauri 开发环境手动冒烟验证。

---

### Task 1: 统一 Git 身份头像的回退展示

**Files:**
- Modify: `src/components/git/GitIdentityAvatar.tsx:1-78`
- Test: Tauri 开发环境中的状态栏与提交区头像回退状态

**Interfaces:**
- Consumes: `GitIdentityAvatarProps` 中的 `name`、`email`、`label`、`compact`。
- Produces: 当 `showImage` 为 `false` 时，`AvatarFallback` 只渲染 lucide `User` 图标。

- [x] **Step 1: 记录当前失败的验收场景**

在没有公开 Libravatar 的 Git 身份下打开仓库；当前 `AvatarFallback` 会渲染如下名称缩写：

```tsx
{name?.trim() ? (
  <span aria-hidden="true">{fallbackText}</span>
) : (
  <User className={cn(compact ? "size-2.5" : "size-3.5")} aria-hidden="true" />
)}
```

预期失败表现：状态栏的 `size-5` 头像显示拥挤的用户名缩写。

- [x] **Step 2: 写入最小实现**

从 `src/components/git/GitIdentityAvatar.tsx` 移除 `initialsFromName` 导入及 `initials`、`fallbackText` 局部变量，并把回退内容替换为：

```tsx
<AvatarFallback className={compact ? "text-[9px]" : undefined}>
  <User className={cn(compact ? "size-2.5" : "size-3.5")} aria-hidden="true" />
</AvatarFallback>
```

- [x] **Step 3: 执行类型检查**

Run: `pnpm exec tsc --noEmit`

Expected: exit code 0。

- [ ] **Step 4: 执行运行时冒烟**

Run: `pnpm tauri dev`

Expected: 打开无公开头像的仓库时，状态栏与提交区显示默认 `User` 图标；当 Libravatar 加载成功时显示图片；悬停身份头像仍显示身份说明。

- [x] **Step 5: 审查变更范围**

Run: `git diff --check && git diff -- src/components/git/GitIdentityAvatar.tsx`

Expected: 仅删除缩写回退逻辑，保留头像加载失败处理和无障碍属性。
