# 插件与技能弹窗 Design QA

- source visual truth path:
  - `/var/folders/pm/06rbm7fd1hsgj04htld4v10c0000gp/T/codex-clipboard-60a06e7d-9fce-4112-b02c-ea83073916ac.png`
  - `/var/folders/pm/06rbm7fd1hsgj04htld4v10c0000gp/T/codex-clipboard-3ac362aa-7633-41cf-b3fe-6a8426e68a87.png`
- implementation screenshot path:
  - `/private/tmp/jlgit-agent-catalog-fixed-skills.jpeg`
  - `/private/tmp/jlgit-agent-catalog-fixed-plugins.jpeg`
- combined comparison path: `/private/tmp/jlgit-agent-catalog-qa-comparison.jpg`
- viewport: 真实 Tauri Debug 应用，截图 `1152 × 768` px
- state: macOS 深色模式；分别验证技能双列状态与插件空状态
- density normalization: 参考图和真实应用截图的窗口尺寸不同，按弹窗宽度、内容区高度、条目密度和图标语义比较，不做逐像素缩放匹配

## Full-view comparison evidence

- 紧凑弹窗最大宽度由 `42rem` 收紧为 `34rem`，少量内容时不再横向铺满大面积空间。
- 插件与技能内容区统一固定为 `13rem`；切换标签后弹窗外框和内容区高度保持稳定。
- 内容区由 shadcn `ScrollArea` 承载，条目超出固定高度后在区域内部滚动，不继续撑高弹窗。

## Focused region comparison evidence

- 两条技能继续采用双列紧凑排列，标题、单行省略说明和更多按钮均完整可见。
- 插件空状态在同一固定高度区域垂直居中，未产生布局跳动。
- 原拼图图标已替换为 Lucide `AtSign`，语义和轮廓更接近参考图中的 `@` 形插件入口。

## Required fidelity surfaces

- Fonts and typography: 沿用项目字体、字号和字重，标题、提示和条目层级清晰。
- Spacing and layout rhythm: 弹窗内边距、标签区、说明区和固定内容区保持紧凑、稳定的垂直节奏。
- Colors and visual tokens: 使用现有背景、前景、边框和强调色 Token，没有新增硬编码颜色。
- Image quality and asset fidelity: 使用 `lucide-react` 的 `AtSign` 矢量图标，无位图替代或自绘图标。
- Copy and content: 保留现有 i18n 文案；描述截断及 Tooltip 行为不变。

## Findings

- 无待处理 P0 / P1 / P2。
- P3：`AtSign` 与参考图内圈箭头细节并非逐像素一致，但它是当前 Lucide 图标库中最接近且符合项目图标规范的选项，不阻塞验收。

## Interaction verification

- 插件 / 技能标签切换通过。
- 技能双列状态与插件空状态均在同一固定高度区域内展示。
- 弹窗关闭和条目选择的原有交互未受影响。

final result: passed

---

# 仓库搜索弹层等距留白 Design QA

- source visual truth path: `/var/folders/pm/06rbm7fd1hsgj04htld4v10c0000gp/T/codex-clipboard-b89acb31-b23b-4629-82b0-518ca5b5b122.png`
- implementation screenshot path: `/private/tmp/jlgit-repository-search-spacing.jpeg`
- focused implementation crop: `/private/tmp/jlgit-repository-search-spacing-crop.jpeg`
- state: macOS 深色模式；真实 Tauri Debug 应用；仓库搜索弹层打开

## Focused comparison evidence

- 仓库列表组沿用 CommandDialog 的 `8px` 水平留白，并将原 `4px` 垂直留白统一为 `8px`。
- 当前仓库选中背景与内容区的上、下、左、右边界形成一致的紧凑间距。
- 搜索输入区、仓库项尺寸和置底的新标签页入口均保持原有项目样式。

## Findings

- 无待处理 P0 / P1 / P2 / P3。

## Interaction verification

- 搜索框保持自动聚焦和可输入状态。
- 当前仓库项与新标签页入口完整显示，原有选择与关闭行为未受影响。

final result: passed

---

# 仓库搜索与活动栏排序 Design QA

- source visual truth path: `/var/folders/pm/06rbm7fd1hsgj04htld4v10c0000gp/T/codex-clipboard-a536bef1-aebb-4a55-88c8-c08b15ed8139.png`
- implementation screenshot path: `/private/tmp/jlgit-repository-search-final.jpeg`
- state: macOS 深色模式；真实 Tauri Debug 应用；当前仓库为 JLGit
- density normalization: 参考图用于表达信息结构，最终实现沿用项目现有紧凑 CommandDialog 尺寸，不做逐像素放大匹配

## Required fidelity surfaces

- Fonts and typography: 沿用项目字体与 Command 组件字号；仓库名和路径形成清晰两级信息。
- Spacing and layout rhythm: 搜索框、仓库项和置底的新标签页保持紧凑等距；移除多余“仓库”分组标题。
- Colors and visual tokens: 使用现有 Command、Badge 与主题 Token，无新增硬编码颜色。
- Image quality and asset fidelity: 使用 Lucide `Search`、`FolderGit2`、`Plus` 图标，无位图替代。
- Copy and content: 提示改为“搜索仓库…”；仓库路径完整参与搜索并在列表中显示。

## Interaction verification

- 当前仓库点击后仅关闭搜索，路由保持不变。
- 仓库项不显示勾选标记；“新标签页”与仓库同组并置底。
- “搜索”已加入左侧活动栏同一 SortableContext。
- 键盘拖拽实测将“搜索”从“标签”下方移到上方；重载应用后顺序保持。
- 无仓库分组时不显示标签；设置分组时在仓库名后使用 Badge 展示。

## Findings

- 无待处理 P0 / P1 / P2。
- P3：验收数据只有一个未分组仓库，分组 Badge 的视觉状态由业务组合代码与单元测试覆盖。

final result: passed
