# 仓库分组右键菜单与持久化锁定设计

日期：2026-07-30

## 目标

仓库分组名称支持右键菜单，敏感删除必须二次确认；锁定状态持久化到 Workspace，确保标签栏与项目管理页行为一致。

## 右键菜单

入口：分组名称（Badge / 标签）。

| 操作 | 确认 | 行为 |
|------|------|------|
| 更换颜色 | 否 | 打开纯自定义色板（HEX，不显示预制色） |
| 关闭分组 | 否 | 仅关闭当前可见、属于该分组的标签 |
| 锁定 / 解锁 | 否 | 切换 `locked`，跨重启保留 |
| 删除分组 | 是 | AlertDialog 二次确认后删除 |

## 删除后

- 仓库转为未分组（`workspace_id = NULL`）
- 已打开标签继续保留

## 锁定后

禁止：

- 拖动分组
- 标签移入 / 移出该分组
- 删除分组
- 调整父级

仍允许：

- 关闭标签、关闭分组
- 更换颜色
- 改名与更换图标
- 解锁

分组标签显示小锁图标。

## 数据层

- Workspace 新增 `locked: boolean`
- SQLite `workspaces` 增加 `locked INTEGER NOT NULL DEFAULT 0`
- 兼容迁移：旧库 `ALTER TABLE` 补列，默认未锁定
- Rust create/update/list、Service、Store 同步读写与校验
- 锁定状态下 `workspace_delete` 与父级变更被拒绝

## 验收

- 右键菜单四项齐全；删除必须确认，其它无需确认
- 锁定跨重启保留，项目管理页也无法删除或移动锁定分组
- 锁定分组显示锁图标，拖拽与标签移入移出失效
- `pnpm check`、`pnpm build`、`cargo fmt --check`、`cargo check` 通过
