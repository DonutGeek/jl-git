# 设置偏好行布局（类 Cursor 分组卡片）

> 日期：2026-07-22  
> 状态：已实现  
> 范围：设置抽屉内「开关 / 下拉 / 分段」类偏好行  
> 不在本期：编辑器主题（「鲸灵 Git」）、路径 Input（竖排保留）、表格列表、侧栏改版

## 1. 背景与目标

当前外观 / 工具 / 通用等偏好多为「标题在上、控件在下」竖排；开关行用 `Item`/`ItemGroup`，与截图中「左文右控、分组卡片」不一致。

目标：在**不改表格列表**的前提下，把可右对齐的偏好行统一成：

- 组外可选小标题（分区级 `SettingsSection` 已有）
- 组内圆角卡片，行间细分割线
- 每行：左侧标题 + 可选说明；右侧 `Switch` / `Select` / 分段控件

## 2. 范围

### 2.1 纳入

| 分区 | 行 |
|------|-----|
| 外观 | 主题（分段）、语言（分段）、客户端字体（下拉）、编辑器字体（下拉） |
| Git | 「提交后推送」开关（表格账号列表不动） |
| 工具 | 外部编辑器（下拉）、终端（下拉）；**路径 Input 仍竖排**，放在对应下拉行下方或组外 |
| 通用 | 开机自启（开关）、启动标签（下拉） |

### 2.2 明确排除

- API Key / Git 账号 / SSH 等 **Table** 列表
- 鲸灵分区的 Textarea 指令、余额区
- 数据 / 关于整页（数据页存储路径与备份已在后续对齐 Item 布局；关于仍除外）
- 设置侧栏结构与搜索
- **编辑器主题「鲸灵 Git」**（下期：设置 → 外观，Diff/文件视图共用）

## 3. 组件设计

新增领域组件（`src/components/settings/`，**不**改 `ui/`）：

### `SettingsPreferenceGroup`

- 薄封装：shadcn `ItemGroup` + `rounded-md border`（与 `SettingsDataPanel` 清理缓存同系）
- 子项之间插入 `ItemSeparator`

### `SettingsPreferenceRow`

- 薄封装：`Item`（`size="sm"`）+ `ItemContent` / `ItemTitle` / 可选 `ItemDescription` + `ItemActions`
- 布局与清理缓存行一致：左文右控；分区级图标仍由 `SettingsSection` 承担
- 说明文案优先复用已有 i18n `*Hint`；没有则省略
- 控件继续用现有 `Switch`、`SelectMenu`、`SegmentedControl`

### 与 shadcn 关系

| 用途 | 组件 |
|------|------|
| 分组 / 行 | `ItemGroup` / `Item` / `ItemSeparator` / `ItemContent` / `ItemTitle` / `ItemDescription` / `ItemActions` |
| 开关 / 下拉 | 已有 `Switch`；业务 `SelectMenu` 保持 |

## 4. 迁移策略

1. 落地两个组件 + 极简用法注释（中文）
2. 按分区改 `SettingsDrawer.tsx`：外观 → Git 开关 → 工具 Select → 通用
3. 路径 Input：保持「标题 + 全宽 Input」竖排，可紧挨在相关 Select 行所在 Group **下方**，避免塞进右栏挤爆
4. 去掉被替换的 `Item`/`ItemGroup` 开关壳（若该处无其它用法）
5. `tsc` + 设置各分区目视冒烟（明暗主题）

## 5. 验收

- [ ] 外观 / 工具 / 通用 / Git 工作流开关为左文右控分组卡片
- [ ] Table 列表视觉与结构未回退
- [ ] 路径 Input 仍可用、未挤进右栏
- [ ] 无新增 `any`；文案走 i18n
- [ ] 未引入编辑器主题相关代码（下期）

## 6. 后续（非本期）

- 设置 → 外观 →「编辑器主题」，首期选项 **鲸灵 Git**（`jingling-git`）
- Diff 与文件视图共用；应用明暗仍控制 light/dark 变体
- 注册表可扩展多套主题

## 7. 自检

- 无占位 TODO 冒充完成
- 范围与「先布局后主题」一致
- 未要求改 `src/components/ui/` 私有实现
