# 编码风格

> **相关文档：** [AGENTS.md](../../AGENTS.md) · [project-structure](project-structure.md) · [frontend](../architecture/frontend.md)

本文是风格细则的唯一真相源。AGENTS 只保留硬规则摘要。

---

## TypeScript

- `strict` 开启；不关闭单个检查来「先跑起来」
- 禁止 `any`；第三方无类型时写最小 `declare` 或 wrapper
- `unknown` 仅用于边界，立刻用类型守卫收窄
- 优先 `interface` 描述对象形状；联合/工具类型用 `type`
- 避免无必要的 `as`；需要时注释原因（中文，一行）
- 枚举：优先 `as const` 对象 + 派生类型，少用 TypeScript `enum`

```ts
export const ThemeMode = {
  Light: "light",
  Dark: "dark",
  System: "system",
} as const;

export type ThemeMode = (typeof ThemeMode)[keyof typeof ThemeMode];
```

---

## React

- 函数组件 + Hooks；箭头函数导出：

```ts
export const ProjectCard = ({ name, branch }: ProjectCardProps) => {
  return <article>...</article>;
};
```

- Props：同文件 `interface XxxProps`
- 事件处理命名：`handleSubmit`、`onBranchChange`（props 用 `on*`）
- 不要为「可能优化」默认包 `memo` / `useCallback`
- 条件渲染保持可读；复杂条件提取变量或组件

---

## 命名

| 种类 | 规则 | 示例 |
|------|------|------|
| 组件文件 | PascalCase | `CommitList.tsx` |
| 工具文件 | camelCase 或 kebab 主题名 | `formatDate.ts` |
| Service | `domain.action.ts` | `git.status.ts` |
| Store | `useXxxStore.ts` | `useGitStore.ts` |
| 常量 | UPPER_SNAKE 或 const 对象 | `MAX_LOG_PAGE = 50` |
| 布尔 | `is` / `has` / `can` 前缀 | `isDetached` |
| 异步函数 | 动词原形即可 | `fetchStatus` |

---

## 文件与文件夹

- 文件夹：`kebab-case` 或小写单词（与现有 `components/ui` 一致用小写）
- 一文件一主导出组件（辅助子组件可同文件，不宜喧宾夺主）
- 组件超过 ~300 行：拆子组件或 hook
- 禁止 `utils.ts` 变成杂物间；按域拆分

---

## Import 顺序

```ts
import { useState } from "react";

import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { ProjectCard } from "@/components/project/ProjectCard";
import { Button } from "@/components/ui/button";

import { useProjects } from "@/hooks/useProjects";

import { useProjectStore } from "@/store/useProjectStore";

import { projectService } from "@/services/project";
import { formatRelative } from "@/utils/formatDate";

import type { Project } from "@/types/project";

import "./ProjectList.css"; // 若有
```

- 组间空行
- `type` import 使用 `import type`
- 路径别名 `@/` 指向 `src/`（与 Vite/tsconfig 一致）

---

## 注释

- 中文
- 只解释：**为什么**、非显然约束、安全注意
- 禁止叙述代码字面意思的注释
- 不留 `TODO` 充数；开 Issue 或立刻做完

---

## 常量与配置

- 魔法数字抽常量并命名意图
- 产品文案不进常量文件硬编码多语言句；走 i18n
- 环境相关配置集中，不散落

---

## 错误处理

```ts
try {
  await gitService.commit(path, message, { paths });
} catch (error) {
  console.error(error);
  toast.error(toUserMessage(error));
}
```

- Service 可抛 `AppError` 或 Result；UI 统一 `toUserMessage`
- 禁止 `.catch(() => {})`

---

## 日志

- 关键路径：`info`；失败：`error`
- 不记录 token、密码、完整环境变量

---

## Rust 风格（摘要）

- `snake_case`；模块清晰
- `Result` 传递；边界转 `AppError`
- 不用 `unwrap` 在生产路径（测试除外）
- 格式用 `rustfmt`；警告在 CI 视为失败（落地后）

---

## 格式化

- 前端：ESLint + Prettier + Husky，见 [code-quality-tooling](code-quality-tooling.md)
- `src/components/ui/**` 不参与格式化改写
- PR 不夹带全文件无关格式化
