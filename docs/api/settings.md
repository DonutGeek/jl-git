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

昼夜模式由 Pinia `useThemeStore` 持久化（`jlgit-theme`），`src/services/theme/theme.service.ts` 负责写 `html.dark`。

| 方法 | 行为 |
|------|------|
| `applyThemeToDocument(mode)` | 切换 `.dark` / `data-theme` / `colorScheme`；`system` 跟 OS |
| `resolveEffective(mode, prefersDark)` | 解析为 `light` \| `dark` |

```ts
type ThemeMode = "light" | "dark" | "system";
```

设置抽屉提供浅色 / 深色 / 跟随系统。状态栏一键切换会落到明确的浅色或深色。

组件样式以 antdv-next 默认/暗色算法为源，见 [theme](../development/theme.md)。

### 应用偏好中的外部工具 / Git PATH

由 `useAppPrefsStore` 持久化（非 SQLite settings）：

| 字段 / 方法 | 行为 |
|-------------|------|
| `shell` / `shellPath` | 工具栏「在终端中打开」 |
| `pullStrategy` / `setPullStrategy` | 工具栏「更新」默认策略：`merge` \| `rebase` |
| `externalEditor` / `externalEditorPath` | 工具栏「在编辑器中打开」 |
| `externalBrowser` / `externalBrowserPath` | 打开远程 / 外链（`openExternalUrl` → `system_open_url`）；下拉选项来自 `system_list_browsers` |
| `gitExtraPathMode` / `setGitExtraPathMode` | `auto`（系统默认，运行时自动发现并注入）或 `custom` |
| `gitExtraPath` / `setGitExtraPath` | 自定义模式下的额外 PATH 目录（换行分隔）；写入时切到 `custom`；设置页可用系统选目录对话框 |
| `probeHookToolchain()` / `discoverNodeBin()`（`src/services/git/git.path.ts`） | 探测 / 发现本机 node（`auto` 模式由启动同步调用） |

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
