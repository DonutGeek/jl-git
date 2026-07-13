# 安全

> **相关文档：** [tauri](../architecture/tauri.md) · [git](../architecture/git.md) · [command](../architecture/command.md) · [AGENTS.md](../../AGENTS.md)

---

## 威胁模型（简版）

JLGit 运行在用户本机，主要风险：

1. **命令注入**：恶意路径/分支名拼进 shell
2. **路径逃逸**：`../` 写出仓库外
3. **敏感信息泄漏**：日志、AI 历史、错误上报中的密钥
4. **更新投毒**：未校验的 updater 载荷
5. **XSS**：Markdown/HTML 渲染未消毒

应用信任「本地用户」，但不信任「仓库内任意文件内容」与「远程返回的未校验数据」。

---

## 硬性控制

### 永不任意 Shell

- Git 与系统调用使用参数数组
- 不提供「执行自定义 shell」Command
- 分支名、tag 名做允许字符校验（拒绝奇怪控制字符）

### 路径校验

对每个仓库写操作：

1. 规范化（canonicalize）
2. `rev-parse --show-toplevel` 确认仓库根
3. 目标文件路径必须落在该根下
4. 拒绝未解析符号链接逃逸（按平台采取安全策略）

### 最小权限

- Tauri capabilities 仅授予需要的 FS/对话框/通知范围
- 不默认开放任意路径读写

### 凭据

- 不实现自建密码库存 Git 密码
- 使用系统 Git credential helper
- 应用设置中的 API Key（AI）：优先 OS 安全存储；不得写入 git 仓库或明文日志

### Updater

- 必须配置公钥验证
- 未配置则禁用更新检查
- endpoints 仅 HTTPS

### 渲染

- `react-markdown` 默认不渲染裸 HTML；若开启需消毒
- 用户仓库 README 预览视为不可信内容

---

## Git 写操作 UX 安全

| 操作 | 要求 |
|------|------|
| discard | 二次确认，列出路径 |
| force push | 二次确认 + 文案说明风险 |
| 跳过 hooks | 默认关闭；若提供须确认 |
| 删除分支/tag | 确认 |

---

## 日志脱敏

禁止记录：

- Authorization / token / cookie
- 私钥、`.env` 内容
- 完整 AI 提示中的密钥

允许：命令名、仓库路径（用户本机已可见）、截断的 stderr。

---

## 依赖与供应链

- 锁文件入库
- 新增依赖审查许可与维护状态
- 定期关注 Tauri / 插件安全通告

---

## 漏洞报告

- 不要在公开 Issue 中贴可利用细节
- 联系维护者并提供复现与影响面
- 修复后在 CHANGELOG 的 Security 节记录（可延迟披露细节）

---

## 安全检查清单（功能 PR）

- [ ] 新 Command 是否参数数组化
- [ ] 路径是否校验
- [ ] 是否扩大了 capabilities
- [ ] 错误/日志是否可能泄漏秘密
- [ ] 危险操作是否有确认
