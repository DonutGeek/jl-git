# 最近项目远程仓库标识 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Dashboard 最近项目的悬停/聚焦状态，展示已识别托管平台的图标与远程仓库末段名称。

**Architecture:** 在 `src/utils` 新增无副作用的 URL 解析函数，负责归一化 HTTPS/SSH 地址并输出平台、仓库名与原始 URL。`RecentProjectList` 保持现有远端读取和缓存，消费该展示模型；品牌 SVG 作为本地静态资源，由单一展示组件映射，未知平台回退到 lucide 的通用 Git 图标。

**Tech Stack:** React 19、TypeScript strict、Vite、Tailwind CSS 4、lucide-react、Vitest（新增的前端单元测试运行器）。

## Global Constraints

- 仅支持 GitHub、GitLab、Gitee、Bitbucket；其他可解析远端显示通用 Git 图标。
- 支持 HTTPS 与 `git@host:path` SSH 格式；优先 origin 的 fetch URL 的既有策略不变。
- 品牌资源本地化，不发起运行时网络请求，不新增运行时图标依赖。
- 产品文案走 i18n；颜色只用现有 token/`currentColor`，不硬编码品牌色。
- UI 不直接 `invoke`，不变更 Rust Command、数据库或远端读取 Service 契约。
- 仅修改本计划列出的文件；不得覆盖工作区中其他未提交改动。

---

### Task 1: 建立远程地址展示模型与单元测试基础

**Files:**
- Create: `src/utils/remoteRepository.ts`
- Create: `src/utils/remoteRepository.test.ts`
- Create: `vitest.config.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

```ts
export type RemoteProvider = "github" | "gitlab" | "gitee" | "bitbucket" | "unknown";

export interface RemoteRepository {
  provider: RemoteProvider;
  repositoryName: string;
  url: string;
}

export function parseRemoteRepository(url: string): RemoteRepository | null;
```

- [ ] **Step 1: 添加测试运行器与失败测试**

  执行 `pnpm add -D vitest`，在 `package.json` 添加：

  ```json
  { "scripts": { "test": "vitest run" } }
  ```

  新建 `vitest.config.ts`，复用 Vite 路径别名：

  ```ts
  import { fileURLToPath, URL } from "node:url";
  import { defineConfig } from "vitest/config";

  export default defineConfig({
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  });
  ```

  新建 `src/utils/remoteRepository.test.ts`，写入下列断言：

  ```ts
  import { describe, expect, it } from "vitest";
  import { parseRemoteRepository } from "./remoteRepository";

  describe("parseRemoteRepository", () => {
    it.each([
      ["https://github.com/DonutGeek/developer-portal-service.git", "github", "developer-portal-service.git"],
      ["git@gitlab.com:group/web.git", "gitlab", "web.git"],
      ["ssh://git@gitee.com/team/tool.git", "gitee", "tool.git"],
      ["https://bitbucket.org/team/api.git", "bitbucket", "api.git"],
      ["git@code.example.com:team/workspace.git", "unknown", "workspace.git"],
    ])("parses %s", (url, provider, repositoryName) => {
      expect(parseRemoteRepository(url)).toEqual({ provider, repositoryName, url });
    });

    it("keeps a repository name without the git suffix", () => {
      expect(parseRemoteRepository("https://github.com/acme/portal")).toEqual({
        provider: "github", repositoryName: "portal", url: "https://github.com/acme/portal",
      });
    });

    it("returns null for an address without a repository path", () => {
      expect(parseRemoteRepository("git@github.com")).toBeNull();
    });
  });
  ```

- [ ] **Step 2: 运行测试确认失败**

  Run: `pnpm test src/utils/remoteRepository.test.ts`

  Expected: 测试因无法解析 `./remoteRepository` 而失败，证明新增行为尚未存在。

- [ ] **Step 3: 实现最小解析函数**

  在 `src/utils/remoteRepository.ts` 定义上述类型；先将 `git@host:path` 转为可用 `/` 分隔的形式，再用 `URL` 读取主机名和 pathname。仅接收有非空末段的 http(s)、`ssh://` 或 SCP 风格 SSH 地址。以 `hostname.toLowerCase()` 精确映射 `github.com`、`gitlab.com`、`gitee.com`、`bitbucket.org`，其余返回 `unknown`；末段通过 `split("/").at(-1)` 提取，不移除 `.git`。

- [ ] **Step 4: 运行测试确认通过**

  Run: `pnpm test src/utils/remoteRepository.test.ts`

  Expected: 全部 7 个断言通过。

- [ ] **Step 5: 提交本任务**

  ```bash
  git add package.json pnpm-lock.yaml vitest.config.ts src/utils/remoteRepository.ts src/utils/remoteRepository.test.ts
  git commit -m "test(git): 增加远程仓库地址解析测试"
  ```

### Task 2: 本地托管平台图标与可访问展示组件

**Files:**
- Create: `src/assets/git-providers/github.svg`
- Create: `src/assets/git-providers/gitlab.svg`
- Create: `src/assets/git-providers/gitee.svg`
- Create: `src/assets/git-providers/bitbucket.svg`
- Create: `src/components/project/RemoteRepositoryLabel.tsx`

**Interfaces:**

```ts
interface RemoteRepositoryLabelProps {
  remote: RemoteRepository;
  onOpen: (url: string) => void;
}
```

- [ ] **Step 1: 添加本地 SVG 资源**

  将四个平台的单色官方标识 SVG 保存至 `src/assets/git-providers/`。每个 SVG 使用 `fill="currentColor"` 或 `stroke="currentColor"`，不含外部引用、内联脚本或硬编码主题色；保留资源来源所需的许可证注释。

- [ ] **Step 2: 实现展示组件**

  `RemoteRepositoryLabel` 使用静态资源路径映射四个平台。对于 `unknown`，从 `lucide-react` 渲染 `GitFork`。统一图标规格为 `size-3.5 shrink-0`、`aria-hidden`；外层为 `span`，拥有 `role="link"`、`tabIndex={0}`、`title={remote.url}`、`cursor-pointer` 及现有 `text-primary`/`hover:underline`/`focus-visible:underline` 风格。

  组件在 `onDoubleClick` 调用 `onOpen(remote.url)`，并 `preventDefault()`、`stopPropagation()`；在 `onKeyDown` 中接受 Enter 与 Space，采用相同阻止冒泡逻辑。显示文本为 `remote.repositoryName`，且加 `truncate`，避免挤压项目名称。

- [ ] **Step 3: 运行类型检查**

  Run: `pnpm exec tsc --noEmit`

  Expected: exit code 0。

- [ ] **Step 4: 提交本任务**

  ```bash
  git add src/assets/git-providers src/components/project/RemoteRepositoryLabel.tsx
  git commit -m "feat(project): 增加远程托管平台标识"
  ```

### Task 3: 接入最近项目列表并回归验证

**Files:**
- Modify: `src/components/project/RecentProjectList.tsx`

**Interfaces:**

```ts
parseRemoteRepository(url: string): RemoteRepository | null;
<RemoteRepositoryLabel remote={remote} onOpen={openRemoteUrl} />
```

- [ ] **Step 1: 将 URL 映射为展示模型**

  在现有 `hoveredId === project.id && remoteUrls[project.id]` 条件中，先调用 `parseRemoteRepository`。只有解析成功时才渲染 `RemoteRepositoryLabel`；不改变 `showRemoteUrl`、`pickPrimaryRemoteUrl`、远端缓存、鼠标/焦点触发时机或错误日志。

- [ ] **Step 2: 保持行级键盘和打开行为**

  删除行内完整 URL 的 `span` 及其重复双击处理，改用 `RemoteRepositoryLabel`。验证标识的事件阻止冒泡，确保双击标识不会触发仓库打开；项目行仍保留单击选中、双击及选中后 Enter 打开。

- [ ] **Step 3: 运行全量自动化检查**

  Run: `pnpm test && pnpm exec tsc --noEmit && pnpm build`

  Expected: 三个命令均以 exit code 0 完成。

- [ ] **Step 4: 执行桌面端冒烟**

  Run: `pnpm tauri dev`

  在 Dashboard 逐项验证：

  - GitHub、GitLab、Gitee、Bitbucket 与未知平台远端分别展示对应图标或通用 Git 图标与末段仓库名；
  - HTTPS 和 SSH 格式均正确；无远端的项目不展示标识；
  - Light/Dark 下图标和文本清晰；悬停、键盘聚焦显示一致；
  - 双击标识只打开远端 URL；双击其他行区域仍打开项目；
  - 打开项目、切换标签及关闭标签时无白屏或控制台无限错误。

- [ ] **Step 5: 提交本任务**

  ```bash
  git add src/components/project/RecentProjectList.tsx
  git commit -m "feat(project): 展示远程仓库平台与名称"
  ```

## Plan Self-Review

- Spec coverage: Task 1 覆盖地址格式、平台映射、未知远端与测试；Task 2 覆盖本地品牌资源、无障碍和主题；Task 3 覆盖现有列表的异步读取、双击行为和桌面验收。
- Placeholder scan: 已给出所有文件路径、接口、测试数据、命令和验收条件；无待补充项。
- Type consistency: 三个任务均使用 `RemoteRepository`、`RemoteProvider`、`parseRemoteRepository` 与 `RemoteRepositoryLabelProps` 的同一组签名。
