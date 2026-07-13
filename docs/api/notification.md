# NotificationService API

> **相关文档：** [command](../architecture/command.md) · [tauri](../architecture/tauri.md) · [security](../development/security.md)

系统通知与应用内反馈的门面。实现：`src/services/notification/`。

应用内 Toast（sonner）可与本 Service 并列：Toast 用于前台即时反馈；系统通知用于后台长任务完成且窗口可能失焦。

---

## 职责划分

| 通道 | 场景 |
|------|------|
| Toast | 提交成功/失败、表单校验、前台操作结果 |
| 系统通知 | Fetch/Push 完成、更新可用（用户允许时） |
| 日志 | 技术细节，不替代用户提示 |

---

## 方法

### `getPermission(): Promise<boolean>`

- 查询通知权限；可封装 Command `notification_permission` 或插件 API
- 一律经本 Service，组件不直连插件

### `requestPermission(): Promise<boolean>`

- 请求权限；拒绝时返回 `false`，不抛致命错

### `send(input: { title: string; body?: string }): Promise<void>`

- 无权限时：降级为 Toast，或静默跳过（由设置 `notification.enabled` 控制）
- 有权限：系统通知

### `toastSuccess(message: string): void` / `toastError(message: string): void` / `toastInfo(message: string): void`

- 对 sonner 的薄封装，统一文案与时长
- 纯前端，无 Command

### `notifyTaskFinished(input: { title: string; body?: string; forceToast?: boolean }): Promise<void>`

- 长任务结束的统一入口：按设置选择系统通知和/或 Toast

---

## 设置键

| Key | 含义 |
|-----|------|
| `notification.enabled` | 是否允许系统通知 |
| `notification.onFetch` | Fetch 完成时通知 |
| `notification.onPush` | Push 完成时通知 |

经 SettingsService 读写。

---

## 使用示例

```ts
try {
  await gitService.push(repoPath);
  await notificationService.notifyTaskFinished({
    title: "Push 完成",
    body: projectName,
  });
} catch (error) {
  notificationService.toastError(toUserMessage(error));
}
```

---

## 安全与隐私

- `title` / `body` 不包含 token、完整 diff、密钥
- 仓库名可用；路径按需缩短

---

## 非职责

- 不发送邮件/Webhook
- 不做营销推送
- 不在未授权时反复弹系统权限骚扰用户
