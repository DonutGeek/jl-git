# 鲸履插件壳 + 内置「简历」— 设计文档

## 背景

鲸履目前是「整窗=简历助手」：左栏仅会话，Composer 上方用 chip 点选项目成稿。希望改成类似 Codex 的 **插件壳**：左栏上半插件、下半会话；简历成为首个内置插件；用 `@` 或自然语言点名项目后由 Agent 识别意图成稿。不做插件市场。

## 决策摘要

| 项 | 选择 |
|----|------|
| 范围 | 轻量插件注册表 + 前端解析；首期仅内置「简历」 |
| 左栏 | 上：插件列表；下：会话列表 |
| `@` | 插件 + 项目名；点左栏插件插入 `@简历` |
| 触发 | **不硬拦**；自然语言（如「帮我给 A 项目生成简历」）与 `@` 等价可解析 |
| 快捷 chip | **去掉**（全部项目简历 / 项目 chip / 加强表述） |
| 路由 | 无二次 LLM；关键词 / `@` / 项目名匹配 |

## 非目标

- 第三方插件安装、市场、沙箱
- 每轮额外 LLM 路由
- 鲸灵侧插件（本变更仅鲸履）
- 恢复 Composer chip（后续若加，仅作插入快捷方式）

---

## §1 产品形态（侧栏）

```
┌──────────┬─────────────────────┐
│ + 新增会话  │ 消息列表              │
│ 插件       │                     │  ← 进入插件列表（简历为其中之一）
│ · 会话…   │ Composer（@插件/@项目） │
└──────────┴─────────────────────┘
```

- **不**使用「插件 / 会话」分区标题
- 「新增会话」下方为「插件」按钮 → 侧栏内切换到插件列表（可返回）
- 点某插件：插入对应 `@` 提及并回到会话列表；简历为首个内置插件，后续可扩展

## §2 插件模型

```ts
interface JinglvPlugin {
  id: string;           // "resume"
  mentionId: string;    // Mentions id，如 "resume"
  mentionDisplay: string; // "@" 后显示，如 "简历"
  titleKey: string;
  descriptionKey: string;
}
```

- 注册表：`src/plugins/jinglv/registry.ts`（或 `src/services/jinglv/plugins.ts`）
- 首期常量列表仅 `resume`；职责/成稿 prompt **仍用**现有 `src/prompts/jinglv/*`（插件包装 UI + 解析，不拆第二套 prompt）

## §3 提及与解析

### Composer

- 复用 `AgentComposer` / `react-mentions-ts`
- 扩展 mention kind：`branch`（鲸灵）| `plugin` | `project`（鲸履）
- `@` 候选分组：插件 / 项目（可写匹配仓）

### 发送时目标仓

优先级：

1. 显式 `project` mentions 的 projectId
2. 纯文本包含的 `projectName`
3. 文案匹配「全部/所有 + 简历|项目」→ 全部可写仓（串行成稿，保留现有 sequential 能力，无 UI chip）
4. 仅 1 个可写仓 → 该仓
5. 否则不锁定仓：轻量上下文、不 enrich；由模型追问

`@简历`：标记启用简历插件上下文（首期整窗仅此插件，等同确认走简历职责；缺项目时模型追问）。

### 自然语言示例

- 「帮我给 A 项目生成简历」→ 解析到 A → enrich → 成稿  
- 「@简历 @A 写一版」→ 同上  
- 只说「写简历」且多仓 → 不 enrich，模型追问项目  

## §4 数据 / 持久化

- 会话仍 `scope: "jinglv"`，`project_id` NULL
- 消息可带 `mentions`（plugin/project）；不新增表
- 无新 Tauri Command

## §5 文案

- 开场白去掉「点全部项目简历 / 下方项目」指引，改为 `@简历`、`@项目名` 或自然语言说明
- i18n：`jinglv.plugins*` 等

## 成功标准

- 左栏可见「简历」插件；点击插入 `@简历`
- `@项目` 或自然语言点名可成稿
- Composer 无 chip
- `tsc` 通过；无 Key 时行为与现网一致（提示配置）
