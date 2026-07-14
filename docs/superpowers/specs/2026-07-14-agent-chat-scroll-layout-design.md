# Agent 对话区滚动布局 — 设计文档

日期：2026-07-14  
范围：`src/components/ai/AgentChatPanel.tsx`（及必要时微调 `src/components/ui/scroll-area.tsx` 的用法，不改公共 API 语义）

## 背景

侧栏 Agent 对话在「输入框绝对定位」后出现滚动条消失、末尾消息被输入框挡住等问题。根因是把 `absolute` 直接打在 shadcn/Radix `ScrollArea` Root 上时，viewport 高度约束失效，虚拟列表总高度无法形成可滚动溢出。

## 目标

1. 输入框保持底部 **绝对定位浮层**（方案 A）
2. 消息区使用 **虚拟滚动**（`@tanstack/react-virtual`）+ **shadcn `ScrollArea`**
3. 长对话溢出时可滚动；滚动条为 **悬停/滚动时显示**（不设 `type="always"`）
4. 内容底部 padding 由 **ResizeObserver 实测输入框高度** 驱动（方案 2），避免硬编码不准
5. 流式输出时 **贴底跟随**：在底部则跟随；用户上翻暂停；回到底部恢复

## 非目标

- 不改会话 Tab、发送逻辑、Agent 流式协议 / `AiService`
- 不做「滚动区减高、滚动条停在输入框上方」的方案 B
- 不强制始终显示滚动条
- 不把主滚动方案改成裸 `overflow-y-auto`（可作调试对照，不可作为交付方案）

## 布局结构

```
section (flex col, h-full, min-h-0, overflow-hidden)
├── header (shrink-0)                    # 会话 Tab + 新建
└── main (relative, flex-1, min-h-0)      # 唯一可伸缩区
    ├── ScrollArea (h-full w-full)       # 通高；Root 禁止 absolute
    │     └── content (px + paddingBottom: composerPadPx)
    │           └── virtual list (height = getTotalSize())
    └── form[ref=composerRef]            # absolute inset-x-3 bottom-3 z-10
```

### 高度链（必须满足）

1. `section` / 侧栏祖先链保持 `h-full` + `min-h-0`
2. `main`：`relative flex-1 min-h-0 overflow-hidden`
3. `ScrollArea` Root：`h-full`（相对 `main` 定高），**不要**在 Root 上使用 `absolute inset-…`
4. Radix Viewport：`h-full`，成为虚拟列表的 scroll element

### 输入框避让（方案 2）

- `composerRef` 挂在 `form`（或包住 form 的测量容器）上
- `ResizeObserver` 读取 `getBoundingClientRect().height`
- `composerPadPx = ceil(height + bottomOffset)`，其中 `bottomOffset` 对应 `bottom-3`（及必要时额外安全间距，如 4–8px）
- 消息内容容器：`style={{ paddingBottom: composerPadPx }}`
- 初始值可用合理 fallback（如 144），避免首帧闪动

## 虚拟列表

- `useVirtualizer`，`getScrollElement` → Radix viewport DOM
- Root 使用 callback ref：挂载后 `querySelector('[data-radix-scroll-area-viewport]')`；若为空则 `requestAnimationFrame` 再取一次
- `estimateSize`：按消息字数粗估行高（避免长文一律 72px 导致总高度偏小）
- `measureElement` + 行级 `ResizeObserver`：流式变高时 `resizeItem`
- 行渲染：`absolute` + `translateY(start)`，保留合理 `overscan`

## ScrollArea 行为

- 组件：`@/components/ui/scroll-area`
- **不**传 `type="always"`（默认 hover/scroll 可见即可）
- 滚动发生在 viewport 上；虚拟列表与贴底逻辑都监听该节点

## 贴底跟随

- `stickToBottomRef`：`scrollHeight - scrollTop - clientHeight < 32` 视为贴底
- viewport `scroll` 被动监听更新 stick 状态
- 切换 `activeConversation.id` 时重置为 `true`
- 当 stick 为 true，且消息内容/流式状态/列表高度变化时，双 `rAF` 后设 `scrollTop = scrollHeight`（等测量完成）

## 错误与边界

- viewport 未绑定时：不调用虚拟列表滚动 API，不抛错；绑定成功后再测量
- `ResizeObserver` 卸载时 disconnect
- 空会话：EmptyState 仍在内容区内，padding 规则同样适用

## 验收标准

| # | 标准 |
|---|------|
| 1 | 输入框为底部绝对定位浮层 |
| 2 | 长对话溢出后，悬停/滚动可见纵向滚动条，且能滚完所有消息 |
| 3 | 末尾消息不被输入框挡住；改输入框高度后 padding 仍正确（或至少当前固定 h-28 下正确） |
| 4 | 流式：贴底跟随；上翻暂停；回底恢复 |
| 5 | 主方案仍为虚拟滚动 + shadcn ScrollArea |

## 实现落点

- 主改：`src/components/ai/AgentChatPanel.tsx`
- 不强制改 `scroll-area.tsx`；若发现全局 viewport 样式阻碍通高，再做最小、有注释的修补并说明影响面

## 决策记录

| 决策 | 选择 |
|------|------|
| 输入框 vs 滚动条关系 | A：浮层 + 滚动通高 |
| 底部避让 | 方案 2：ResizeObserver 实测高度 |
| 滚动条可见性 | 悬停/滚动时显示 |
| 流式贴底 | 智能跟随（上翻暂停） |
| 技术栈 | 虚拟滚动 + shadcn ScrollArea |
