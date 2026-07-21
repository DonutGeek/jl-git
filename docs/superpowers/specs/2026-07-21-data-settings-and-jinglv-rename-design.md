# 设置「数据」分类 + 鲸履更名 — 设计说明

> 日期：2026-07-21  
> 状态：待实现  
> 相关：`docs/architecture/database.md` · `docs/architecture/command.md` · `docs/product/ai.md` · `docs/superpowers/specs/2026-07-20-resume-helper-design.md`

## 1. 背景与目标

JLGit 的应用数据分散在 SQLite（`jlgit.db`）、Tauri Store（若干 JSON）与 localStorage。用户需要在设置中：

1. **看到**数据目录与数据库路径，并在系统文件管理器中打开  
2. **按模块清理**（二次确认）  
3. **导出 / 导入**完整备份包  

同时将产品名「简历帮」统一为 **鲸履**（与「鲸灵」成对）。自定义数据库路径不在首期。

## 2. 已确认决策

| 项 | 决策 |
|----|------|
| 设置入口 | 新分类「数据」（`SettingsCategory = "data"`） |
| 导航顺序 | … → 工具 → **鲸履** → **数据** → 通用 |
| 清理粒度 | 按产品能力拆（见 §4） |
| 「全部应用数据」 | 含对话 + Store + localStorage；**不含** `projects` / `workspaces` / `recent_projects` |
| 备份 | 单包：DB + 全部 Store JSON + 约定 localStorage；带 `manifest.json` |
| 产品名 | 用户可见「鲸履」；代码标识可保留 `resume_helper` / `resumeHelper` |
| 非目标 | 自定义 DB 路径、分项导出、真正清空项目列表 |

## 3. 设置 UI

### 3.1 分类

- `id`: `data`
- 文案键：`settings.sectionData`（zh: 数据 / en: Data）
- 图标：建议 `Database` 或 `HardDrive`（lucide）

### 3.2 右侧结构（自上而下）

**A. 存储位置**

- 只读展示：
  - 应用数据目录（`appDataDir`）
  - 数据库文件路径（`databasePath` = `{appDataDir}/jlgit.db`）
- 操作：
  - 复制路径（前端剪贴板即可）
  - 「在访达中显示」/「在资源管理器中显示」→ `app_data_reveal`（目录；可选同时 reveal db 文件）

**B. 清理**

每个模块一行：标题、一句说明、「清理」按钮 → 确认 Dialog → 调用 `app_data_clear`。

「全部应用数据」使用 destructive 样式，确认文案明确：**不会删除已登记仓库与工作区**。

清理成功后：前端刷新相关 Zustand / 重新拉取列表；必要时 toast 提示「部分界面偏好需重启后完全生效」（若清 UI 偏好）。

**C. 备份**

- 「导出备份…」→ 系统保存对话框 → `app_data_export`  
- 「导入备份…」→ 选文件 → 校验 → 强确认覆盖 → `app_data_import`  
- 导入成功：toast + 建议重启应用（首期可 `relaunch` 或文案提示手动重启）

## 4. 清理模块

| module id | 用户可见名 | 行为 |
|-----------|------------|------|
| `agent_chats` | 鲸灵对话 | 删除 `chat_conversations` 中 `scope=agent`（CASCADE 消息） |
| `resume_chats` | 鲸履对话 | 删除 `scope=resume_helper` 会话 |
| `ai_secrets` | AI 密钥与指令 | 清空/重置 `ai-secrets.json`（密钥 + 各类指令） |
| `git_accounts` | Git 身份账号 | 清空/重置 `git-accounts.json` |
| `resume_identity` | 鲸履联系信息 | 清空/重置 `resume-helper.json` |
| `ui_prefs` | UI 偏好 | 清除约定 localStorage 键（主题、语言、字体、分栏、diff/分支/历史偏好等，见 §6） |
| `open_tabs` | 打开标签 | 清除 `jlgit-open-tabs` 等标签会话键 |
| `all_app_data` | 全部应用数据 | 执行以上全部；**不**删 projects/workspaces/recent |

确认：单模块普通确认；`all_app_data` 额外强调不可撤销与「保留仓库列表」。

## 5. Command 与前端 Service

命名前缀：`app_data_`（与 `chat_` / `project_` 并列）。

| Command | 输入 | 输出 |
|---------|------|------|
| `app_data_paths` | `{}` | `{ appDataDir, databasePath }` |
| `app_data_reveal` | `{ target: "dir" \| "database" }` | `{ ok: true }` |
| `app_data_clear` | `{ module: string }` | `{ ok: true }` |
| `app_data_export` | `{ destPath: string }` | `{ ok: true }` |
| `app_data_import` | `{ sourcePath: string }` | `{ ok: true }` |

前端：`src/services/data/data.service.ts`（或 `appData.service.ts`），UI **不**直连 `invoke`。

路径校验：导出/导入路径必须规范化；禁止任意 shell。Reveal 使用系统 API（如 `opener` / `showItemInFolder`），不执行用户字符串命令。

导出前若 DB 有打开连接：优先安全拷贝（SQLite backup API 或一致快照），避免拷到半截 WAL。

## 6. 备份包格式

扩展名：`.jlgit-backup.zip`（推荐 zip，跨平台）。

```
manifest.json
jlgit.db
stores/
  ai-secrets.json
  git-accounts.json
  resume-helper.json
localStorage.json          # 仅约定键的键值对象
```

`manifest.json` 示例：

```json
{
  "format": "jlgit-backup",
  "formatVersion": 1,
  "appId": "com.jingling.jlgit",
  "appName": "JLGit",
  "createdAt": "2026-07-21T02:00:00.000Z"
}
```

导入校验：

1. 可解压且存在 `manifest.json`  
2. `format === "jlgit-backup"` 且 `formatVersion` 受支持（首期仅 `1`）  
3. 缺关键文件则失败并 toast  

覆盖策略：导入前关闭/暂停对目标文件的写入；替换 Store 文件与 DB；`localStorage.json` 由前端写入约定键（Rust 可把该文件放进临时目录再由前端应用，或导入 Command 只处理文件系统部分、localStorage 由 FE 读 zip 内 JSON——推荐 **Rust 负责 zip/DB/Store，FE 负责 localStorage 段**：export 时 FE 把 localStorage 快照传给 Rust 写入包；import 时 Rust 返回 `localStorage` 对象给 FE 写入）。

约定 localStorage 键（首期至少）：

- `jlgit-theme`
- `jlgit-locale`
- `jlgit-app-prefs`
- `jlgit-open-tabs`
- `jlgit:diff-view-prefs`
- `jlgit:branch-list-prefs`
- `jlgit:history-graph-width`
- `jlgit:history-view-prefs`
- `jlgit:split:*`（导出时扫描 `localStorage` 中此前缀的键）

## 7. 鲸履更名

### 7.1 范围

- 所有用户可见文案：`resumeHelper.*.json`、设置分类标题、窗口标题、按钮、清理模块名、文档中的产品称呼  
- 品牌对：Git Agent = **鲸灵**，简历助手 = **鲸履**

### 7.2 不改（YAGNI）

- 代码路径 / 类型名：`resumeHelper`、`ResumeHelperWorkspace`、`resume_helper` scope、Store 文件名 `resume-helper.json`  
- 窗口 label：`resume-helper`（Tauri window id）  
- DB `scope` 值：`resume_helper`（避免迁移）

英文 UI：可用 “Jinglü” 或 “Resume (Jinglü)”——首期建议 **Jinglü** 作专有名，副文案保留 Resume Helper 语义一句（可选）。默认：**en 显示 “Jinglü”**，与 zh「鲸履」对应。

## 8. 架构数据流

```
SettingsDrawer (data)
  → DataService
      → invoke(app_data_*)
          → Rust app_data / db / fs
  → 清理后：useAgentChatStore.clear* / 鲸履 hydrate 清空 / Store reload / localStorage
```

错误：Service 转 `AppError`；UI toast；禁止空 catch。

## 9. 错误处理与安全

- 清理 / 导入均为破坏性操作，必须确认  
- 导入失败不得留下半截损坏状态：优先写临时目录再替换，失败则回滚或明确报错并保留原文件  
- 备份含 API Key：导出文件视为敏感；UI 一句提示「备份含密钥，请妥善保管」  
- 不把密钥写入日志  

## 10. 测试要点

- `app_data_paths` 返回存在的目录与 `jlgit.db` 路径  
- 各 `module` 清理后对应数据消失，projects 仍在  
- `all_app_data` 后 projects 仍在  
- 导出 zip 含 manifest；篡改 formatVersion 导入失败  
- 导出再导入后对话 / 密钥 / 偏好可恢复（抽样）  
- 文案无残留「简历帮」（zh）

## 11. 文档更新（实现时）

- `docs/architecture/command.md` — `app_data_*`  
- `docs/architecture/database.md` — 备份/清理说明  
- `docs/product/feature-list.md` — 数据设置、鲸履命名  
- `docs/product/ai.md` / resume 相关 — 鲸履  
- `docs/api/` — 若有 Settings/Data API 页则补一节  

## 12. 非目标（再次强调）

- 自定义 / 迁移数据库目录  
- 分模块独立导出文件  
- 清空已登记仓库列表  
- 远程同步备份  

---

## 附录：实现分期建议

| 批次 | 内容 |
|------|------|
| P0 | 鲸履文案更名 + 设置「数据」壳 + paths/reveal |
| P1 | 按模块清理 + 确认 Dialog |
| P2 | 导出 / 导入备份包 |
