# 仓库标签栏分组打磨

> 日期：2026-07-30  
> 状态：已批准并实施

## 目标

1. 修复标签栏最右侧竖线显示问题  
2. 分组配置色应用到**标签组外框**；拖拽经过时同色反馈  
3. 拖拽**分组名称**可重排命名分组，并写入 `workspace.sortOrder`  
4. **未分组**不显示分组壳/「未分组」标签；外观与普通标签一致，仍可组内排序，并可拖入命名组（`join-group`）

## 行为

| 场景 | 行为 |
|------|------|
| 命名组外框 | `border-workspace-{color}` |
| 拖标签经过命名组 | 同色加强 ring/border |
| 拖组名到另一命名组 | 仅重排可见命名组，回写其 `sortOrder` 池 |
| 新标签组 | 无壳，不参与组排序 |
| 未分组 | 无壳、无名称条（不显示「未分组」）；可排序；拖到命名组 → 加入该组 |
| 命名组标签拖出原组 | 仍为取消分组（既有行为） |
| 拖拽幽灵 | 命名组标签 / 组名条使用分组色边框反馈 |

## 主要改动

- `workspaceGroupAppearance.tsx`：`WORKSPACE_BORDER_CLASS` / ring class  
- `RepoTabGroup.tsx`：仅 `string` workspace 显示壳；组名可拖；颜色边框  
- `RepoTabBar.tsx`：隐藏本处纵向 ScrollBar；组拖拽 end；进组 updateProject  
- `repoTabGroups.ts`：drop action 支持 ungrouped→group；组排序工具函数 + 测试  
