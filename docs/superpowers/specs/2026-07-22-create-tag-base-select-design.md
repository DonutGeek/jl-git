# 创建标签/分支基点 Select + 侧栏排序简化

日期：2026-07-22  
状态：已实现

## 1. 背景与目标

1. 「创建标签 / 创建分支」弹窗中，基点选择当前为常驻展开大列表，应改为表单式 **shadcn Select**。
2. 侧栏标签 / 分支列表排序菜单当前为 4 项（名称升/降 + 时间升/降），收成仅 **升序 / 降序**（按名称）。

## 2. 范围

**在范围内**

- `CreateTagDialog`：非 `fixedRef` 时的基点 Select
- `CreateBranchDialog`：非 `fixedStartPoint` 时的起点 Select（同理）
- 官方 CLI 引入 `src/components/ui/select.tsx`（若不存在）
- `TagListFilterMenu` / `BranchListFilterMenu`：排序仅两项
- `tagListPrefs` / `branchListPrefs`：排序类型收窄为 `nameAsc` | `nameDesc`
- 相关 i18n

**不在范围内**

- Combobox / 可搜索过滤
- 后端 Command / Service / Store 契约变更
- 差异面板 / 历史列表等其它排序菜单

## 3. 创建标签 / 创建分支：Select

| 项 | 行为 |
|----|------|
| 布局 | 文案「创建…基于」+ 全宽 Select；其余表单项保持 |
| 占位 | 「请选择」（i18n，可复用或新增 `common.pleaseSelect` / `repo.pleaseSelect`） |
| 默认值 | 打开时 **无选中**；不再默认当前分支 / HEAD |
| 选项 | 本地分支、远端分支；创建标签额外含标签组。可用 `SelectGroup` |
| 「当前 HEAD」 | **不出现** |
| 固定基点 | `fixedRef` / `fixedStartPoint` 仍只读，不出现 Select |
| 提交 | 名称非空 **且** 已选基点 才可提交 |
| 弹窗尺寸 | 紧凑（去掉为大列表预留的高度） |

创建分支选项仅分支（本地 + 远端），不含标签——除非当前从标签创建（`fixedStartIsTag`）走只读路径。与截图「分支和标签」对齐的是创建标签弹窗；创建分支保持「选分支作起点」。

## 4. 侧栏排序：仅升序 / 降序

| 项 | 行为 |
|----|------|
| 菜单项 | 仅两项：文案 **「升序」**、**「降序」** |
| 语义 | 按 **名称**（`localeCompare`）；升序 = `nameAsc`，降序 = `nameDesc` |
| 去掉 | 按时间的 `timeAsc` / `timeDesc` |
| 默认 | 分支默认 `nameAsc`；标签默认 `nameDesc`（与现默认一致，仅去掉时间项） |
| 旧偏好 | localStorage 中若读到 `timeAsc` / `timeDesc`，回退到对应默认 `sort` |
| 高亮 | 「非默认」指示逻辑不变（仍比默认 sort） |

## 5. 实现要点

1. `pnpm dlx shadcn@latest add select`（禁止手写 `ui/select`）
2. 精简两 Dialog 内列表/过滤/`PickRow` 等本地组件
3. `TagListSort` / `BranchListSort` → `"nameAsc" | "nameDesc"`；删除时间比较路径
4. i18n：占位「请选择」；排序「升序」「降序」（zh-CN / en）

## 6. 验收

- [ ] 创建标签：Select、无预选、含分支+标签；未选禁用提交
- [ ] 创建分支：Select、无预选、含本地+远端分支；未选禁用提交
- [ ] 固定基点路径仍只读
- [ ] 侧栏标签/分支排序菜单仅「升序」「降序」，按名称生效
- [ ] 旧 time* 偏好安全回退
- [ ] `tsc` 通过；`ui/select` 仅 CLI 引入

## 7. 明确决策

- Select 方案 A；**无默认值**
- 创建分支同理改 Select
- 排序文案「升序 / 降序」，**按名称**（选项 C）
