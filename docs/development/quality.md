# 质量与自检

> **相关文档：** [testing](testing.md) · [ui-guidelines](ui-guidelines.md) · [AGENTS.md](../../AGENTS.md) · [CONTRIBUTING](../../CONTRIBUTING.md)

JLGit 是桌面工具型产品，**写完必须自检**，不能把「能编译」当成完成。  
本文定义：**Bug 严重级别**、**交付前自检清单**、**AI / 人类共同遵守的门禁**。

---

## 1. Bug 严重级别

按**用户能否继续完成核心 Git 工作流**分级。级别越高，越不允许带着上线或交给用户验收。

| 级别 | 名称 | 定义 | 处理要求 |
|------|------|------|----------|
| **S0** | 阻断 / 崩溃 | 白屏、进程崩溃、无限重渲染（Maximum update depth）、无法打开应用或无法进入任何仓库 | **立即修**；不得合并；不得「先交付再看」 |
| **S1** | 严重功能损坏 | 核心路径不可用：打开仓库失败且无提示、切换仓库整页闪白/卡死、提交/暂存导致错误数据、路径逃逸/命令注入等安全问题 | **必须修完再交付**；PR 不得合并 |
| **S2** | 主要体验缺陷 | 功能可用但明显错误：拖拽被遮挡、分隔线悬停挤布局、纯图标无提示、切换仓库整页刷白（壳层被拆）、错误吞掉无 toast | **本轮交付前应修**；若刻意延后须在 PR 写明原因与跟进项 |
| **S3** | 次要 / 视觉 | 对齐偏差、文案略拗口、间距不均、非主路径空状态文案缺失 | 可记入后续；同批改动顺手修更好 |
| **S4** | 建议 / 增强 | 性能微调、动效偏好、尚未排期的能力占位 | 不阻塞；进 roadmap / feature-list |

### 1.1 分级示例（来自真实踩坑）

| 现象 | 级别 | 说明 |
|------|------|------|
| `Maximum update depth exceeded` / 白屏报错 | **S0** | 常见于：① Zustand selector 每次返回新引用（如 `state.status?.entries ?? []`，`status` 为空时每次新 `[]`）→ React `useSyncExternalStore` / `forceStoreRerender` 死循环；② 布局库 `useDefaultLayout` 订阅 localStorage 写回成环；③ `useEffect` 无条件 setState。**禁止**在 selector 里 `?? []` / `?? {}`；用模块级常量空数组/空对象。分栏用 shadcn Resizable（`ResizableSplit` 或同套 `ResizablePanelGroup` + `RESIZABLE_HANDLE_CLASSNAME`，仅松手写 storage），勿用会订阅 storage 的 `useDefaultLayout`，禁止自绘 `cursor-*-resize` 分隔 |
| 切换仓库整页变成 loading、壳层消失再重建 | **S1/S2** | 用户感知为「整个应用刷一下」；应保留壳只换数据 |
| 拖拽标签被下方工具栏裁切遮盖 | **S2** | 交互可用性受损 |
| 分隔线悬停加粗挤动内容 | **S2** | 布局抖动 |
| 红绿灯与标签垂直未对齐 | **S3** | 视觉 |
| 同步按钮「即将支持」占位 | **S4** | 未排期能力 |

### 1.2 升级规则

- 同一 **S2** 在主路径反复出现（如每次切仓库都闪）→ 按 **S1** 处理  
- 涉及安全（路径、shell、凭据）→ 最低按 **S1**，不论是否「偶发」  
- 无法稳定复现但日志显示崩溃 → 先按 **S0/S1** 排查，不得忽略

---

## 2. 写完必须自检（门禁）

任何功能改动、交互改动、状态/布局改动，在声称「完成」或请用户验收前，执行下列检查。  
**AI Agent 与人类贡献者同等适用。**

### 2.1 机器检查（必做）

```bash
pnpm exec tsc --noEmit
# 若改了 Rust：
cd src-tauri && cargo test
```

- [ ] `tsc` 通过，无新增 `any` / 空 catch  
- [ ] 相关 Rust 单测通过（若改了 Command / 解析 / 路径）

### 2.2 运行时冒烟（必做，改 UI / 路由 / Store 时）

在 `pnpm tauri dev`（或当前开发方式）下至少走一遍：

- [ ] 打开已有仓库，顶栏 / 工具栏 / 三栏正常  
- [ ] **切换仓库标签**：壳层不消失；无整页白屏；无控制台无限报错  
- [ ] 关闭标签、再从最近项目打开  
- [ ] 拖拽面板分隔线：悬停高亮、松手后不高亮「粘住」、不挤布局  
- [ ] 拖拽仓库标签排序：预览不被工具栏遮挡  
- [ ] 纯图标悬停有 Tooltip  

若改动触及提交/暂存：再加 stage → commit → 历史可见。

### 2.3 状态与副作用自检（易出 S0/S1）

- [ ] `useEffect` 依赖不会因「每次 set 新对象/写 storage」形成环  
- [ ] 写 `localStorage` / Zustand persist 的路径：确认不会在 mount 时无条件反复写入  
- [ ] **Zustand selector**：禁止 `?? []` / `?? {}`（每次新引用 → Maximum update depth）；用模块级常量  
- [ ] **面板布局**：勿用 `useDefaultLayout`；用 shadcn Resizable（`ResizableSplit` / `RESIZABLE_HANDLE_CLASSNAME`），含历史图谱列  
- [ ] 路由 `projectId` 变化：只刷新数据，不无故拆掉顶栏/工具栏  
- [ ] cleanup 只在「离开页面」时 `reset`，不要在「同页换 id」时清空导致闪白  
- [ ] Store 的 `set`：无变化时返回原 state（或提前 return），避免无意义通知  

### 2.4 UX 自检（对照 ui-guidelines）

- [ ] 光标约定（可点 pointer、分隔线 col/row-resize）  
- [ ] 加载 / 空状态 / 错误可感知  
- [ ] 文案走 i18n  

---

## 3. 交付声明模板

向用户或 PR 说明「完成」时，建议显式带上：

```text
自检：
- [ ] tsc / 相关 cargo test
- [ ] 冒烟：打开仓库、切换标签、拖拽分隔线/标签
- [ ] 本改动无已知 S0/S1；已知 S2+ 已列出或已修
```

若存在未修问题，必须写明**级别 + 现象 + 是否阻塞验收**。

---

## 4. 与 Definition of Done 的关系

[AGENTS.md §23 Definition of Done](../../AGENTS.md) 是合并清单；本文是其**质量补充**：

- DoD 偏「规范与契约」  
- 本文偏「严重级别 + 运行时自检」  
- **S0/S1 未清 = 未达到 DoD**

---

## 5. 反模式

- 只跑 `tsc` 就说做完，不点一遍切换仓库  
- 把无限重渲染、白屏当成「偶发刷新问题」降级为 S3  
- 用整页 `loading` 替换壳层掩盖异步（制造闪白）  
- 发现 S2 却不写进 PR / 对话，让用户当测试员
