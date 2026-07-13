# 历史详情文件对比

日期：2026-07-13

## 目标

历史详情中点击改动文件后，以弹层覆盖左侧（ActivityBar + 侧栏 + 历史列表）展示该文件相对 parent 的前后对比；右侧详情栏不动。

## 交互

- 仅改动文件可点；选中高亮
- 弹层宽度 = 实测历史详情左缘 − 分隔条宽度（露出拖拽线）
- 底层分栏布局保持挂载，避免详情栏抖动
- **仅顶栏返回 / 关闭按钮可关弹层**；Esc、点空白不关闭
- 拖拽分栏后吞掉残影 click，避免误切提交导致弹层关闭
- 切换主视图（变更 / 工作区）再回到历史：弹层保持（不清空选中文件）
- 点击另一改动文件：切换对比内容，弹层不关
- 切换提交时清空选中文件
- 标签：左 = parent 完整 hash（根提交用「空树」），右 = 当前完整 hash

## 架构

```
HistoryDetailPane click → selectCommitFile
RepoPage: absolute overlay (CommitFileDiffPane) over left region
CommitFileDiffPane → git_commit_file_diff → diff.rs
```

复用 DiffPreviewToolbar / Monaco 预览工具。
