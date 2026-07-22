# Windows 窗口顶栏 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Windows 主窗与全部子窗使用无系统标题栏 + 右侧自绘最小化/最大化·还原/关闭；macOS Overlay 与 `pl-[88px]` 零回归；并更新 ui-guidelines / tauri / feature-list。

**Architecture:** `tauri.windows.conf.json` 仅 Win 关闭 decorations；`createAppWindowOptions()` 统一子窗平台选项；`useWindowChromeLayout` + `WindowChromeControls` 接入所有顶栏。

**Tech Stack:** Tauri 2 Window API、React hooks、lucide-react、i18n、Design Tokens。

## Global Constraints

- macOS：Overlay + traffic lights `(16,26)` + `pl-[88px]` 不得改变
- Windows：`decorations: false` + 自绘三键；左侧不再 88px 空档
- 主窗 + 全部子窗；文档硬性交付
- 禁止手改 `src/components/ui/`；文案走 i18n；注释中文

---

## File Map

| 文件 | 职责 |
|------|------|
| `src-tauri/tauri.windows.conf.json` | 仅 Win 主窗 `decorations: false` |
| `src/services/window/windowChrome.ts` | 子窗创建选项平台分支 |
| `src/hooks/useWindowChromeLayout.ts` | padding / 是否显示 Win 控件 |
| `src/components/layout/WindowChromeControls.tsx` | Win 三键 UI |
| `src/components/layout/RepoTabBar.tsx` + 各 `*Workspace.tsx` | 接入 hook + 控件 |
| `src/services/window/*.ts` | 改用共用选项 |
| `src-tauri/capabilities/*.json` | window 控制权限 |
| `src/i18n/locales/{zh-CN,en}/common.json` | 三键文案 |
| `docs/development/ui-guidelines.md` 等 | 文档 |

---

### Task 1: Win 主窗 decorations + capabilities

**Files:**
- Create: `src-tauri/tauri.windows.conf.json`
- Modify: `src-tauri/capabilities/default.json` 及全部子窗 capability

- [ ] **Step 1:** 创建 `tauri.windows.conf.json`：

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "app": {
    "windows": [
      {
        "decorations": false
      }
    ]
  }
}
```

（与主 conf 按 RFC7396 merge；数组项按位置合并字段，不替换整个窗口对象。）

- [ ] **Step 2:** 在每个 capability 的 `permissions` 追加（若 schema 名不同以 gen schema 为准）：

```json
"core:window:allow-minimize",
"core:window:allow-maximize",
"core:window:allow-unmaximize",
"core:window:allow-toggle-maximize",
"core:window:allow-close",
"core:window:allow-is-maximized",
"core:window:allow-set-focus"
```

涉及：`default.json`、`agent-global.json`、`branch-manage.json`、`branch-history.json`、`file-history.json`、`branch-compare.json`。

- [ ] **Step 3:** 对照 `src-tauri/gen/schemas/desktop-schema.json` 或 capabilities 校验，确认权限标识存在。

---

### Task 2: 子窗选项工厂 + layout hook + Chrome 控件

**Files:**
- Create: `src/services/window/windowChrome.ts`
- Create: `src/hooks/useWindowChromeLayout.ts`
- Create: `src/components/layout/WindowChromeControls.tsx`
- Modify: `src/i18n/locales/zh-CN/common.json`、`en/common.json`

- [ ] **Step 1:** `windowChrome.ts`：

```ts
import { LogicalPosition } from "@tauri-apps/api/dpi";

export type AppOs = "macos" | "windows" | "linux" | string;

export function detectAppOs(): AppOs {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "macos";
  if (ua.includes("win")) return "windows";
  if (ua.includes("linux")) return "linux";
  return "unknown";
}

/** WebviewWindow 构造选项中与标题栏相关的字段 */
export function createAppWindowChromeOptions(os: AppOs = detectAppOs()) {
  if (os === "windows") {
    return { decorations: false as const, hiddenTitle: true };
  }
  return {
    titleBarStyle: "overlay" as const,
    hiddenTitle: true,
    trafficLightPosition: new LogicalPosition(16, 26),
  };
}
```

- [ ] **Step 2:** `useWindowChromeLayout.ts`：

```ts
import { useEffect, useState } from "react";
import { getAppInfo } from "@/services/system/system.info";
import { detectAppOs, type AppOs } from "@/services/window/windowChrome";

export function useWindowChromeLayout() {
  const [os, setOs] = useState<AppOs>(() => detectAppOs());

  useEffect(() => {
    void getAppInfo()
      .then((info) => setOs(info.os))
      .catch(() => {
        /* 保持 UA 兜底 */
      });
  }, []);

  const isMacOverlay = os === "macos";
  const showWinControls = os === "windows";

  return {
    os,
    isMacOverlay,
    showWinControls,
    headerPaddingClass: isMacOverlay ? "pl-[88px]" : "pl-3",
  };
}
```

- [ ] **Step 3:** `WindowChromeControls.tsx`：用 `getCurrentWindow()`；`minimize` / `toggleMaximize` / `close`；`isMaximized` + `onResized` 切图标；双击由父级拖拽区处理；i18n keys：`common.windowMinimize` 等；lucide：`Minus` / `Square` / `Copy`（还原）/ `X`。

- [ ] **Step 4:** common.json 增补 zh/en 文案。

---

### Task 3: 接入主窗 RepoTabBar + 子窗顶栏 + window 工厂

**Files:**
- Modify: `RepoTabBar.tsx`、`MultiAgentWorkspace.tsx`、`BranchManageWorkspace.tsx`、`BranchCompareWorkspace.tsx`、`FileHistoryWorkspace.tsx`、`BranchHistoryWorkspace.tsx`
- Modify: `multiAgentWindow.ts`、`branchManageWindow.ts`、`historyWindows.ts`、`branchCompareWindow.ts`

- [ ] **Step 1:** 各顶栏：`headerPaddingClass` 替换 `pl-[88px]`；右侧在 flex-1 拖拽区后挂载 `{showWinControls ? <WindowChromeControls /> : null}`。
- [ ] **Step 2:** 拖拽区 `onDoubleClick` → `getCurrentWindow().toggleMaximize()`（仅 Win，或全平台无害）。
- [ ] **Step 3:** 子窗工厂：`...createAppWindowChromeOptions()` 替换写死的 overlay 字段。
- [ ] **Step 4:** `rg 'pl-\[88px\]'` 应仅剩 hook 定义处（或 mac 分支字面量）。

---

### Task 4: 文档 + 类型检查

**Files:**
- Modify: `docs/development/ui-guidelines.md`、`docs/architecture/tauri.md`、`docs/product/feature-list.md`

- [ ] **Step 1:** ui-guidelines 增加「窗口顶栏 / 平台分支」小节。
- [ ] **Step 2:** tauri.md 增加 decorations / Overlay / capabilities。
- [ ] **Step 3:** feature-list 一行「Windows 自定义窗口顶栏」。
- [ ] **Step 4:** 运行 `pnpm exec tsc --noEmit`（或项目等价脚本）期望通过。

---

## Spec coverage

| Spec § | Task |
|--------|------|
| 4.1 主窗 Win decorations | T1 |
| 4.2 子窗选项 | T2 + T3 |
| 5.1–5.3 hook/控件/接入 | T2 + T3 |
| 6 capabilities | T1 |
| 7 i18n | T2 |
| 8 文档 | T4 |
| mac 零回归 | T3 不改 mac 分支 + T4 测试清单 |

## Self-review

- 无 TBD；权限名以 schema 校验为准  
- `createAppWindowChromeOptions` / `useWindowChromeLayout` / `WindowChromeControls` 命名一致  
- Linux 本轮不专项验收（与 spec 一致）
