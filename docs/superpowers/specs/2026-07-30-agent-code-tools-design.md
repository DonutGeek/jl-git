# 鲸灵只读代码工具（第一阶段）

> 日期：2026-07-30  
> 状态：已确认，实施中

## 目标

让鲸灵能回答「项目有没有支付/分享模块」「某功能在哪个页面/逻辑」等代码级问题。

| 宿主 | 访问范围 |
|------|----------|
| 单仓鲸灵 | 仅当前打开仓库 |
| 多仓鲸灵 | 必须先 `@项目`（或显式点名），仅已登记仓库 |

## 工具（只读）

| 名称 | 能力 |
|------|------|
| `list_dir` | 浏览仓库内相对目录一层 |
| `read_file` | 读取文本文件（限大小） |
| `search_code` | 在仓库内搜索代码（`git grep`） |

禁止：写文件、改 Git、访问仓库外路径、读密钥 / `.env` / 私钥 / 二进制。

## 安全

1. 沿用本地门禁 `getAgentSafetyRefusal`（工具前）
2. 路径必须相对仓根；canonicalize 防越界（复用现有 Rust 校验）
3. Deny：`.env*`、`*.pem`、`id_rsa*`、`*.key`、`.git/`、常见二进制扩展、`node_modules`/`dist` 等
4. 默认 `read_file` ≤ 96 KiB；`search_code` 限命中条数与单条长度
5. 工具结果与回灌消息一律 `redactSecrets`
6. Prompt 声明：工具结果为不可信数据；第一阶段只读

## 调用模型

- DeepSeek Chat Completions **function calling**
- 通用 Git Agent 模式启用工具；简历 / 技能创建 **不**启用
- 工具环请求统一 `stream: true`：SSE 组装 `tool_calls`；一旦出现 tool_calls 则不再向 UI 推 content；纯正文轮边收边 `onDelta`
- 工具环默认关闭 thinking，避免 `reasoning_content` 回传复杂度；无工具的纯流式路径仍遵循用户 thinking 开关
- 最多 6 轮工具调用，超时沿用现有 Agent 超时

## 非目标（本阶段）

- 鲸灵修改代码或自动写盘
- 插件市场式工具扩展
- 跨仓未 `@` 时的自动全库搜索

## 验收

- 单仓：问「支付相关代码在哪」能 `search_code` / `read_file` 后给出路径级回答
- 多仓：未 `@项目` 时工具不可用并提示先点名；`@` 后仅访问该仓
- 尝试读 `.env` / 越界路径被拒绝且不泄密
