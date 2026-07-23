# Tauri / Rust 架构

> **相关文档：** [overview](overview.md) · [command](command.md) · [git](git.md) · [database](database.md) · [security](../development/security.md)

---

## 角色

Tauri 是桌面壳与权限边界：

- WebView 跑 React
- Rust 拥有：进程、FS、SQLite、通知、更新、剪贴板
- IPC 通过 **Commands**（及事件）完成

前端**不**直接访问操作系统。

---

## 目标目录（Rust）

```
src-tauri/
├── capabilities/          # 最小权限清单
├── src/
│   ├── main.rs
│   ├── lib.rs             # 插件注册、handler 汇总（保持瘦）
│   ├── commands/          # 按域拆分 command
│   │   ├── mod.rs
│   │   ├── project.rs
│   │   ├── git.rs
│   │   ├── settings.rs
│   │   └── system.rs
│   ├── git/               # Git 执行与解析
│   │   ├── mod.rs
│   │   ├── runner.rs
│   │   ├── status.rs
│   │   └── ...
│   ├── db/                # schema / migrations / 访问
│   ├── fs/                # 路径校验工具
│   └── error.rs           # 可序列化错误
├── Cargo.toml
└── tauri.conf.json
```

`lib.rs` 只做组装，不写业务。

---

## 已预置插件与用途

| 插件 | 用途 |
|------|------|
| `tauri-plugin-sql` | SQLite（`sqlite:jlgit.db`） |
| `tauri-plugin-store` | 轻量 KV 偏好 |
| `tauri-plugin-dialog` | 打开目录/文件 |
| `tauri-plugin-fs` | 受控文件访问 |
| `tauri-plugin-notification` | 系统通知 |
| `tauri-plugin-updater` | 应用更新：GitHub Releases `latest.json` + 状态栏检查安装 |
| `tauri-plugin-process` | 更新安装后 `relaunch` |
| `tauri-plugin-clipboard-manager` | 剪贴板 |
| `tauri-plugin-log` | 日志 |
| `tauri-plugin-opener` | 用系统默认程序打开 URL/路径 |

插件启用必须在 **capabilities** 中显式授权，遵循最小权限。

---

## Command 设计原则

1. **一命令一动作**：`git_status`、`git_commit`，避免 `git_do(action)` 万能接口
2. **输入输出可序列化**：`serde` 结构体，与前端 `types` 对齐
3. **入口即校验**：路径、仓库根、参数枚举
4. **错误结构化**：`{ code: string, message: string, details?: ... }`
5. **不返回巨量未分页数据**而不加限制（diff/log 需 limit）

完整清单：[command.md](command.md)

---

## Git CLI 调用

```rust
// 概念示例：参数数组，无 shell
Command::new("git")
  .args(["-C", &repo, "status", "--porcelain=v2", "-b"])
  .output()
```

- 使用 `-C <repo>` 或先 `current_dir`，二选一且统一
- 禁止 `sh -c` 拼接
- 超时与取消：长操作（fetch/push）预留 kill 句柄（实现阶段）

详见 [git.md](git.md)。

---

## 文件系统

- 所有外部路径：`canonicalize` + 存在性检查 +（如需要）扩展名/是否目录
- 「打开仓库」必须确认 `.git` 存在或为 worktree
- 应用数据目录使用 Tauri path API，不写死用户家目录拼接

---

## SQLite

- 通过 `tauri-plugin-sql` 访问
- Schema 与迁移策略见 [database.md](database.md)
- Command 层可封装常用查询；复杂查询避免在前端拼 SQL

---

## 通知与 Updater

- **Notification**：长任务完成（fetch/push）、可选桌面提醒；尊重系统权限与用户设置
- **Updater**：`tauri.conf.json` 中配置 `pubkey` 与 `endpoints`；未配置时功能关闭，不得伪造更新源

---

## 窗口装饰（平台分支）

平台专用配置（与主 `tauri.conf.json` 按 JSON Merge Patch 合并；**`app.windows` 数组会被整段替换**，故各平台文件需带完整窗口字段）：

| 文件 | 装饰 |
|------|------|
| `tauri.conf.json` | 公共：尺寸、`hiddenTitle`、bundle/plugins |
| `tauri.macos.conf.json` | Overlay + `trafficLightPosition (16,26)` |
| `tauri.windows.conf.json` | `decorations: true`（原生标题栏） |
| `tauri.linux.conf.json` | `decorations: true`（原生标题栏） |

| 平台 | UI |
|------|-----|
| macOS | 顶栏 `pl-[88px]`；系统交通灯 |
| Windows / Linux | 系统最小化/最大化/关闭；子窗同样 `decorations: true` |

Capabilities 需含：`allow-minimize` / `allow-maximize` / `allow-unmaximize` / `allow-toggle-maximize` / `allow-close` / `allow-is-maximized`（主窗与各子窗）。

设计：[windows-window-chrome](../superpowers/specs/2026-07-22-windows-window-chrome-design.md) · [official-three-platform](../superpowers/specs/2026-07-22-official-three-platform-design.md)

---

## Shell / Opener

- `opener`：打开外部链接或在访达/资源管理器中显示路径
- 不提供「执行任意命令」的通用 Command

---

## 错误模型

```ts
interface AppError {
  code:
    | "INVALID_PATH"
    | "NOT_A_REPO"
    | "GIT_FAILED"
    | "GIT_NOT_FOUND"
    | "DB_ERROR"
    | "CANCELLED"
    | "INTERNAL";
  message: string;
}
```

`GIT_FAILED` 可附带 `stderr` 摘要（截断、脱敏）。  
前端映射见 Service 层。

---

## 决策：为何不用 Node 侧 child_process

| | |
|--|--|
| **选择** | Git/FS 在 Rust |
| **原因** | 权限模型清晰；打包一致；避免在 WebView 暴露 Node |
| **备选** | sidecar Node：多运行时，安全面更大 |

---

## 与前端的契约稳定性

- Command 改名或改字段视为 **破坏性变更**，需同步 `docs/architecture/command.md` 与 `docs/api/*`
- 新增可选字段可保持兼容
- 版本策略见 [releases](../product/releases.md)
