# Agent 对话区滚动布局 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 Agent 侧栏对话在「输入框绝对定位」下滚动条消失/末尾被挡的问题，保持虚拟滚动 + shadcn ScrollArea，并用 ResizeObserver 实测输入框高度做底部避让。

**Architecture:** `main` 区 `flex-1 min-h-0` 定高；`ScrollArea` 用 `h-full` 通高（Root 禁止 absolute）；`form` 绝对定位浮在底部；内容 `paddingBottom` 由 composer 实测高度驱动；虚拟列表滚动元素绑定 Radix viewport；贴底跟随沿用 stick 逻辑。

**Tech Stack:** React 19、`@tanstack/react-virtual`、shadcn/Radix `ScrollArea`、ResizeObserver

**Spec:** `docs/superpowers/specs/2026-07-14-agent-chat-scroll-layout-design.md`

---

## File map

| 文件 | 职责 |
|------|------|
| `src/components/ai/AgentChatPanel.tsx` | 唯一实现落点：布局、viewport 绑定、composer 测高、虚拟列表估算、贴底 |
| `src/components/ui/scroll-area.tsx` | 默认不改；仅当 Task 4 冒烟失败且确认是全局 viewport 样式问题时再做最小修补 |

---

### Task 1: 重建通高布局（ScrollArea h-full + 定位输入框）

**Files:**
- Modify: `src/components/ai/AgentChatPanel.tsx`

- [ ] **Step 1: 确认当前错误结构**

打开 `AgentChatPanel.tsx` 的 return。若 `ScrollArea` Root 上仍有 `absolute inset-x-0 top-0 bottom-…`，记为待删。

- [ ] **Step 2: 改成 spec 布局骨架**

将消息区 + 输入框改为（保留 header 与现有会话 Tab 逻辑不动）：

```tsx
<section
  className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
  aria-label={t("agent.title")}
>
  <header className="flex h-10 shrink-0 items-center gap-1 px-3">
    {/* 现有会话 Tab + 新建按钮，不改交互 */}
  </header>

  <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
    <ScrollArea
      ref={bindMessageScrollArea}
      className="h-full w-full"
    >
      <div
        className="px-3 pt-2"
        style={{ paddingBottom: composerPadPx }}
      >
        {/* EmptyState + 虚拟列表：下一步任务补齐绑定与 pad */}
      </div>
    </ScrollArea>

    <form
      ref={composerRef}
      className="bg-background absolute inset-x-3 bottom-3 z-10 rounded-md"
      onSubmit={handleSubmit}
    >
      {/* 现有 Textarea + 发送按钮 */}
    </form>
  </div>
</section>
```

要点：
- **删除** ScrollArea 上的 `type="always"`（滚动条改为默认 hover）
- **删除** ScrollArea Root 上的 `absolute` / `bottom-36` 一类定位
- `composerPadPx` 先用临时常量 `144`，Task 2 再接 ResizeObserver

- [ ] **Step 3: 类型检查**

Run:

```bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 22
cd /Users/jingling/Documents/demo/JLGit && pnpm exec tsc --noEmit
```

Expected: 无错误（若缺 `composerPadPx` / `composerRef` / `bindMessageScrollArea`，先在组件内加最小声明再过 tsc）。

- [ ] **Step 4: Commit（若用户要求提交时再执行）**

```bash
git add src/components/ai/AgentChatPanel.tsx
git commit -m "$(cat <<'EOF'
fix(agent): 对话区改用通高 ScrollArea + 定位输入框骨架

EOF
)"
```

---

### Task 2: ResizeObserver 实测输入框高度 → paddingBottom

**Files:**
- Modify: `src/components/ai/AgentChatPanel.tsx`

- [ ] **Step 1: 增加状态与 ref**

在组件内加入：

```tsx
const COMPOSER_BOTTOM_OFFSET_PX = 12; // 对应 bottom-3
const COMPOSER_PAD_FALLBACK_PX = 144;

const composerRef = useRef<HTMLFormElement>(null);
const [composerPadPx, setComposerPadPx] = useState(COMPOSER_PAD_FALLBACK_PX);
```

- [ ] **Step 2: 挂载 ResizeObserver**

```tsx
useLayoutEffect(() => {
  const el = composerRef.current;
  if (!el) {
    return;
  }
  const update = (): void => {
    const height = el.getBoundingClientRect().height;
    setComposerPadPx(Math.ceil(height + COMPOSER_BOTTOM_OFFSET_PX));
  };
  update();
  const observer = new ResizeObserver(update);
  observer.observe(el);
  return () => observer.disconnect();
}, []);
```

- [ ] **Step 3: 内容容器使用实测 padding**

确认消息内容外层：

```tsx
<div className="px-3 pt-2" style={{ paddingBottom: composerPadPx }}>
```

- [ ] **Step 4: 冒烟**

Run: `pnpm tauri dev`（或现有前端 dev），打开仓库 → Agent 侧栏 → 造长对话。

Expected:
- 输入框浮在底部
- 滚到最底时，最后一条消息完整露出在输入框上方（不被挡住）

- [ ] **Step 5: Commit（若用户要求）**

```bash
git add src/components/ai/AgentChatPanel.tsx
git commit -m "$(cat <<'EOF'
fix(agent): 用 ResizeObserver 驱动对话内容底部避让

EOF
)"
```

---

### Task 3: 绑定 Radix viewport + 修正虚拟列表估算

**Files:**
- Modify: `src/components/ai/AgentChatPanel.tsx`

- [ ] **Step 1: callback ref 绑定 viewport**

替换仅一次的 `useLayoutEffect([], …)` 查询为：

```tsx
const messageScrollAreaRef = useRef<HTMLDivElement | null>(null);
const [messageViewport, setMessageViewport] = useState<HTMLDivElement | null>(null);

const bindMessageScrollArea = useCallback((node: HTMLDivElement | null) => {
  messageScrollAreaRef.current = node;
  if (!node) {
    setMessageViewport(null);
    return;
  }
  const syncViewport = (): void => {
    const viewport = node.querySelector("[data-radix-scroll-area-viewport]");
    setMessageViewport(viewport instanceof HTMLDivElement ? viewport : null);
  };
  syncViewport();
  window.requestAnimationFrame(syncViewport);
}, []);
```

`ScrollArea`：`ref={bindMessageScrollArea}`。

- [ ] **Step 2: virtualizer 使用 viewport + 字数估算**

```tsx
const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
  count: messages.length,
  getScrollElement: () => messageViewport,
  getItemKey: (index) => messages[index]?.id ?? index,
  estimateSize: (index) => {
    const content = messages[index]?.content ?? "";
    const lines = Math.max(1, Math.ceil(content.length / 40));
    return Math.min(24 + lines * 18, 2400);
  },
  measureElement: (element) => element.getBoundingClientRect().height,
  overscan: 8,
});
```

保留现有行级 `ResizeObserver` / `getMessageRowRef` / `resizeItem` 逻辑。

- [ ] **Step 3: 确认贴底逻辑仍监听 `messageViewport`**

现有 `scroll` 监听与双 `rAF` `scrollTop = scrollHeight` 保持；依赖数组继续包含 `lastMessage?.content`、`isStreaming`、`messages.length`、`messageViewport`、`virtualizer`。

- [ ] **Step 4: 冒烟（核心验收）**

1. 让助手输出长文（或多次「长文本」）直到超出视口  
2. 鼠标移入消息区右侧：应出现纵向滚动条（hover）  
3. 能滚到顶部最早消息  
4. 流式时在底部跟随；手动上翻后不再强拉；滚回底部后恢复跟随  

Expected: 全部通过；无 S0/S1（崩、无限重渲染、无法滚动）。

- [ ] **Step 5: `tsc`**

```bash
pnpm exec tsc --noEmit
```

Expected: 通过。

- [ ] **Step 6: Commit（若用户要求）**

```bash
git add src/components/ai/AgentChatPanel.tsx
git commit -m "$(cat <<'EOF'
fix(agent): 修复对话虚拟列表 viewport 绑定与高度估算

EOF
)"
```

---

### Task 4: 回归与（仅必要时）ScrollArea 微调

**Files:**
- Modify only if needed: `src/components/ui/scroll-area.tsx`
- Modify: `src/components/ai/AgentChatPanel.tsx`（若 Task 3 仍失败）

- [ ] **Step 1: 若滚动仍不可用，检查高度链**

在 DevTools 中确认：
- `main` 有非零 `clientHeight`
- `ScrollArea` Root `clientHeight` ≈ `main`
- viewport `scrollHeight > clientHeight`（长对话时）

若 Root 高度为 0：检查侧栏祖先是否缺 `min-h-0` / `h-full`（`RepoPage` 侧栏 `aside` 已有 `h-full min-h-0 overflow-hidden`，一般无需改）。

- [ ] **Step 2: 仅当确认是 viewport 全局样式问题时再改 scroll-area**

最小修补示例（仅在有证据时做，并加中文注释）：

```tsx
// 仅当 Agent 通高滚动仍失败且归因于此再提交
<ScrollAreaPrimitive.Viewport className="h-full max-h-[inherit] w-full rounded-[inherit] [&>div]:!block [&>div]:!min-w-0">
```

若当前已是该样式且其它面板滚动正常，**不要改**公共组件，回到 Task 1–3 查布局。

- [ ] **Step 3: 对照 spec 验收表勾选**

按 `docs/superpowers/specs/2026-07-14-agent-chat-scroll-layout-design.md` 验收标准 1–5 手工勾选。

- [ ] **Step 4: 最终 `tsc` + 冒烟**

```bash
pnpm exec tsc --noEmit
```

Expected: 通过；质量文档意义上无已知 S0/S1。

---

## Spec coverage check

| Spec 要求 | Task |
|-----------|------|
| 输入框 absolute 浮层 | Task 1 |
| ScrollArea 通高、Root 非 absolute | Task 1 |
| 不设 type=always | Task 1 |
| ResizeObserver → paddingBottom | Task 2 |
| viewport 绑定 + 虚拟列表估算/测量 | Task 3 |
| 贴底跟随 | Task 3（保留并验证） |
| 验收 / 必要时 scroll-area | Task 4 |

## Placeholder scan

无 TBD /「稍后实现」类步骤。
