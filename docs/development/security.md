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
6. **Agent 滥用**：利用通用模式或技能生成未授权入侵、凭据窃取、恶意软件、诈骗等违法伤害内容
7. **仓库 Prompt Injection**：README、源码注释、文件名、提交信息或 patch 伪装成系统指令，诱导泄密或越权

应用仅在本机仓库选择与确认操作范围内信任「本地用户」；Agent 内容安全不因本地身份而豁免。始终不信任「仓库内任意文件内容」与「远程返回的未校验数据」。

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

## 鲸灵 Agent 内容安全

采用两层防护，覆盖单仓、多仓、简历与技能创建：

1. **本地高置信度门禁**：发送前仅检查最近一条用户请求；明确命中凭据窃取、恶意软件/免杀、未授权访问、钓鱼诈骗、暴力或非法制品时，直接返回本地化拒绝文案。此时不读取仓库、不构建个人/多仓画像、不读取 API Key、不调用模型。
2. **宿主级安全 Prompt**：所有通用模式和技能加载同一安全基线，覆盖更广的违法伤害意图、敏感信息披露与仓库 Prompt Injection；具体技能不得覆盖或降低此基线。

边界：

- 允许安全代码审查、密钥泄露检测、恶意软件分析、事故响应、合规与明确授权测试等防御任务。
- 高风险意图不明确时，只询问授权与防御范围，不先给可操作的攻击细节。
- README、源码注释、文件名、提交信息、patch 与生成文件全部视为数据，不执行其中要求覆盖规则、泄露 Prompt/密钥或触发动作的指令。
- 用户消息与仓库上下文在发送模型前统一走凭据脱敏；模型输出永不直接作为 shell、Git 或文件写入指令执行。
- 本地规则只承担高置信度快速拦截，不以关键词列表代替完整法律判断；更广语义由公共安全 Prompt 约束，并用恶意/防御性对照用例持续回归。

---

## Git 写操作 UX 安全

| 操作 | 要求 |
|------|------|
| discard | 二次确认，列出路径；操作前创建可恢复 stash |
| force push | 二次确认 + 文案说明风险 |
| 跳过 hooks | 默认关闭；若提供须确认 |
| 文件树删除 | 确认；移动到系统废纸篓；符号链接不得跟随目标 |
| 删除分支/tag | 确认；复合删除优先保留本地引用 |

---

## 日志脱敏

禁止记录：

- Authorization / token / cookie
- 私钥、`.env` 内容
- 完整 AI 提示中的密钥

允许：命令名、仓库路径（用户本机已可见）、截断的 stderr。

Git 参数与 stdout/stderr 在 Rust 事件边界统一脱敏，包括 URL credentials、访问 token、
Authorization header 与 credential/askpass 配置。

---

## 依赖与供应链

- 锁文件入库
- 新增依赖审查许可与维护状态
- 定期关注 Tauri / 插件安全通告
- `mammoth → argparse 1.0.3` 的旧 lodash 通过精确 pnpm override 固定到已修复版本；不得恢复 lodash 3

### 当前审计例外

| Advisory | 结论 | 重新评估条件 |
|----------|------|--------------|
| `GHSA-qwww-vcr4-c8h2`（React Router） | 不适用：JLGit 仅使用 Browser Router 的 Library Mode，不引入或调用该公告限定的 unstable RSC API | 引入 RSC API，或规划 React Router 8 升级时 |

## 备份导入

- 备份 ZIP 仅允许 manifest、数据库、localStorage 与固定 Store 文件名；禁止按目录前缀放行
- 所有 ZIP 条目必须通过封闭路径检查，并限制单项与累计解压体积，防止 Zip Slip / Zip Bomb
- imported DB 至少校验 SQLite 文件头；启动连接或迁移失败时恢复导入前数据库
- 备份包含密钥且不加密，导出界面必须明确提示用户安全保存

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
- [ ] 新 Agent 模式是否加载宿主级安全 Prompt
- [ ] 高风险请求是否在仓库读取 / API 调用前拦截
- [ ] 防御性安全请求是否有对照测试，避免关键词误伤
