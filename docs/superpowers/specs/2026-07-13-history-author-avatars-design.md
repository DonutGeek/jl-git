# 历史列表作者头像与共同作者

日期：2026-07-13  
状态：已确认（用户「开始」）

## 目标

历史提交列表展示真实作者头像；若 commit 含 `Co-authored-by` trailer，则叠放共同作者头像（对齐参考客户端）。

## 范围

**做：**

- `git_log` 输出 `authorEmail` + `coAuthors[{ name, email }]`
- 仅解析 `Co-authored-by` trailer（不把 committer≠author 算共同作者）
- 安装 shadcn `avatar`；`GitIdentityAvatar` 基于其封装
- 历史行：轻微重叠叠放（主作者 + 共同作者，最多 3，超出 `+N`）+ 主作者名
- 更新 command / types / 相关测试

**不做（本轮）：**

- 详情面板共同作者专区
- 历史列表字号调整
- 头像本地缓存 / 离线包

## 数据流

```
git log --format=…%ae…%(trailers:key=Co-authored-by)…
  → Rust parse → GitCommitSummary
  → HistoryList → GitIdentityAvatar（shadcn Avatar + Libravatar）
```

## UI

- 头像尺寸约 16–18px（列表密度）
- 叠放：后一个相对前一个左移约 6–8px，白边描边
- 悬停 title 列出全部作者 / 共同作者
- 无邮箱或 Libravatar 404 → AvatarFallback 缩写

## 错误与边界

- trailer 格式异常：跳过该条，不影响整页 log
- 无共同作者：仅主作者头像
- 网络失败：静默回退 fallback（现有逻辑）
