# 历史详情：显示分支 / 显示大小

日期：2026-07-13

## 目标

历史详情元信息区已有「显示分支」「显示大小」占位按钮。点击后按钮消失，展示对应信息行。

## 交互

- 点击「显示分支」→ 按钮消失 → 文案：`位于 N 个分支：HEAD, main, origin/main`（en：`In N branches: …`）
- 点击「显示大小」→ 按钮消失 → 文案：`文件: N 大小: 698.91KB`
- 加载中：对应按钮 disabled + spinner
- 失败：toast，按钮保留可重试
- 切换选中提交：两按钮恢复、结果清空

## 数据口径

- **分支**：`git branch -a --contains <rev>`；若 `HEAD` 指向该提交则前置 `HEAD`
- **大小（方案 A）**：`N` = 该提交相对各 parent 的改动文件去重数；大小 = 非删除文件在该提交中的 blob 字节之和（删除计 0）

## 架构

点按钮懒加载，不扩 `git_show`。

```
HistoryDetailPane → gitService → git_commit_containing_branches / git_commit_change_size → show.rs
```

## 不做

- 点后不可再隐藏
- 整树大小
- 把结果永久写入 `GitCommitDetail`
