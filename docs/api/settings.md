# SettingsService / ThemeService / AiService API

> **相关文档：** [database](../architecture/database.md) · [theme](../development/theme.md) · [ai](../product/ai.md) · [command](../architecture/command.md)

本页覆盖设置域及相关门面。实现目录：`src/services/settings/`、`theme/`、`ai/`。

---

## SettingsService

### 类型

```ts
type SettingsMap = Record<string, unknown>;
```

已知键见 [database.md](../architecture/database.md) 的 settings 节。

### 方法

| 方法 | Command | 说明 |
|------|---------|------|
| `getAll(): Promise<SettingsMap>` | `settings_get_all` | 启动注入 Store |
| `get<T>(key: string): Promise<T \| null>` | `settings_get` | |
| `set(key: string, value: unknown): Promise<void>` | `settings_set` | value 可 JSON 序列化 |

### 使用

```ts
await settingsService.set("locale", "zh-CN");
useSettingsStore.getState().patch({ locale: "zh-CN" });
```

失败时回滚 Store 并 toast。

### 非职责

- 不执行 Git
- 不存储 AI API Key 明文（见 AiService / security）

---

## ThemeService

主题是设置的一等公民，单独门面便于 UI 调用。

### 方法

| 方法 | 行为 |
|------|------|
| `getMode(): Promise<ThemeMode>` | 读 `theme.mode`，默认 `system` |
| `setMode(mode: ThemeMode): Promise<void>` | 持久化 + 应用 DOM class |
| `applyToDocument(mode: ThemeMode): void` | 仅应用，供启动/跟随系统 |
| `resolveEffective(mode, systemPrefersDark): "light" \| "dark"` | 纯函数 |

```ts
type ThemeMode = "light" | "dark" | "system";
```

`setMode` 内部调用 `settingsService.set("theme.mode", mode)`，避免双写两套存储。

Tokens 定义见 [theme](../development/theme.md)。

---

## AiService

产品行为见 [ai](../product/ai.md)。此处仅 API 边界。

### 历史

| 方法 | Command |
|------|---------|
| `listHistory(options?: { projectId?; limit? })` | `ai_history_list` |
| `addHistory(entry)` | `ai_history_add` |
| `clearHistory(projectId?: string)` | `ai_history_clear` |

### 生成（目标）

```ts
interface AiGenerateInput {
  kind: "commit_message" | "diff_explain" | "review" | "branch_name" | "release_notes";
  projectId?: string;
  promptContext: string; // 已截断/脱敏的上下文
}

interface AiGenerateResult {
  text: string;
  model?: string;
}
```

| 方法 | 说明 |
|------|------|
| `isEnabled(): Promise<boolean>` | 读设置 |
| `generate(input): Promise<AiGenerateResult>` | 调提供商；可取消（AbortSignal） |
| `getSettings()` / `saveSettings()` | 非密钥字段走 Settings；密钥走安全存储 |

`generate` **成功后不自动 commit**。调用方展示结果，用户确认后走 `gitService.commit` 等。

### 错误

| 情况 | 行为 |
|------|------|
| 未启用 / 无 Key | 明确错误码，UI 引导去设置 |
| 网络失败 | 可重试 |
| 超时 | 可取消 |

---

## 导出建议

```ts
export { settingsService } from "./settings";
export { themeService } from "./theme";
export { aiService } from "./ai";
```
