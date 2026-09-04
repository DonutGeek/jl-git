# 编码风格

> **相关文档：** [AGENTS.md](../../AGENTS.md) · [project-structure](project-structure.md) · [frontend](../architecture/frontend.md)
>
> 前端风格对齐 **work-center-web**（`<script setup>`、`defineOptions`、就近分层）。本文是风格细则的唯一真相源。AGENTS 只保留硬规则摘要。

---

## TypeScript

- `strict` 开启；不关闭单个检查来「先跑起来」
- 禁止 `any`；第三方无类型时写最小 `declare` 或 wrapper
- `unknown` 仅用于边界，立刻用类型守卫收窄
- 优先 `interface` 描述对象形状；联合/工具类型用 `type`
- 避免无必要的 `as`；需要时注释原因（中文，一行）
- 枚举：优先 `as const` 对象 + 派生类型，少用 TypeScript `enum`
- **异步统一 `async` / `await`（硬性）**：禁止 `.then()` 链。`src/api/` 的接口函数一律声明 `async`（同步工具函数除外），需要剥壳时先 `await` 再取字段，只为副作用调用时直接 `await` 不接收返回值

```ts
export const ThemeMode = {
  Light: "light",
  Dark: "dark",
  System: "system",
} as const;

export type ThemeMode = (typeof ThemeMode)[keyof typeof ThemeMode];
```

```ts
// 剥壳：先 await 拿到结果再取字段
export async function listProjects(workspaceId?: string): Promise<Project[]> {
  const result = await requestClient.get<ProjectListResult>("projectList", {
    params: { workspaceId },
  });
  return result.projects;
}

// 只为副作用：await 后不接收返回值，别用 .then(() => undefined) 抹掉类型
export async function removeProject(id: string): Promise<void> {
  await requestClient.delete<OkResult>("projectRemove", { params: { id } });
}
```

---

## Vue

- 仅 `<script setup lang="ts">` + 组合式 API
- 每个组件用 `defineOptions` 声明 PascalCase 名称
- 路由页目录用 camelCase；页面入口为 `index.vue`（`defineOptions` 仍用 PascalCase 组件名）
- layouts / 可复用封装目录仍可用 `index.vue` / `index.ts`

```vue
<script setup lang="ts">
import { Button } from "antdv-next";

import type { ProjectCardProps } from "./types";

defineOptions({ name: "ProjectCard" });

const props = defineProps<ProjectCardProps>();
</script>

<template>
  <article>
    <Button type="primary">{{ props.name }}</Button>
  </article>
</template>
```

- Props：同文件或就近 `interface XxxProps`，经 `defineProps`
- 事件：`defineEmits`；处理函数命名 `handleSubmit`，对外事件 `on*` / `update:*`
- 可复用弹窗：`defineExpose({ open })`，`open(payload?)` 内重置再打开；父组件不要绑 `:open` / `:mode`
- 不要为「可能优化」默认包多余 `computed` / `watch`
- 条件渲染保持可读；复杂条件提取变量或子组件
- 通用副作用优先 `@vueuse/core`；深拷贝 / 路径 / 集合操作优先 `lodash-es`

---

## 命名

| 种类 | 规则 | 示例 |
|------|------|------|
| 路由页目录 | camelCase | `views/dashboard/` |
| 路由页文件 | `index.vue` | `views/repo/index.vue` |
| 组件名 | PascalCase + `defineOptions` | `RepoPage` |
| 可复用组件目录 | PascalCase | `components/Icon/` |
| 页面私有组件文件 | PascalCase `.vue` | `TaskFormModal.vue` |
| 工具文件 | camelCase 或 kebab 主题名 | `formatDate.ts` |
| API 文件 | 域名词或按能力拆分 | `src/api/git/status.ts` |
| Store 文件 | 域名词 `locale.ts`，禁止 `useLocaleStore.ts` | `store/modules/locale.ts` |
| Store 导出 | `useXxxStore`；组件外 `useXxxStoreWithOut()` | `useLocaleStore` |
| 路由 name | lowerCamelCase | `repoStatus` |
| 路由 path | kebab-case | `/repo/:project-id` |
| 常量 | UPPER_SNAKE 或 const 对象 | `MAX_LOG_PAGE = 50` |
| 布尔 | `is` / `has` / `can` 前缀 | `isDetached` |
| 异步函数 | 动词原形即可 | `fetchStatus` |

同一功能内，TypeScript 模块 / Store / 工具 / 指令文件不得混用 lower camel 与 kebab-case。

---

## 文件与文件夹

- `src/views/` 业务模块目录：`camelCase`；页面入口为 `index.vue`
- 可复用组件封装目录：`PascalCase`，`index.ts` 为公开入口，实现放 `src/`
- 一文件一主导出组件（辅助子组件可同文件，不宜喧宾夺主）
- 组件超过 ~300 行：拆子组件或 hook
- 禁止 `utils.ts` 变成杂物间；按域拆分

---

## Import 顺序

```ts
import { computed, ref } from "vue";
import { useRouter } from "vue-router";

import { Button, Modal } from "antdv-next";
import { useI18n } from "vue-i18n";

import { Icon } from "@/components/Icon";

import { useTheme } from "@/hooks/setting/useTheme";
import { useProjectList } from "@/views/dashboard/hooks/useProjectList";

import { useProjectStore } from "@/store/modules/project";

import { listProjects } from "@/api/project";
import { formatRelative } from "@/utils/formatDate";

import type { Project } from "@/types/project";
```

- 组间空行
- `type` import 使用 `import type`
- 路径别名 `@/` 指向 `src/`（与 Vite/tsconfig 一致）
- 第三方包导入置顶于本仓库模块

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
const message = useMessage();

try {
  await gitService.commit(path, commitText, { paths });
} catch (error) {
  console.error(error);
  message.error(error);
}
```

- Service 可抛 `AppError` 或 Result；应用内 toast 直接 `message.error(error)`
- 内联字符串（表单 `error`、页面 `loadError`）仍可用 `toUserMessage`
- 禁止 `.catch(() => {})`
- 同类交互使用一致的 loading：列表用 `Spin`，单次操作用按钮 `loading`

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

- 前端：ESLint + Prettier，见 [code-quality-tooling](code-quality-tooling.md)
- Vue 文件走 `eslint-plugin-vue` + `vue-eslint-parser`
- PR 不夹带全文件无关格式化
