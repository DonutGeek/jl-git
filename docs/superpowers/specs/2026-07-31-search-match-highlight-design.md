# 搜索匹配高亮设计

日期：2026-07-31

## 目标

列表筛选时，对命中关键字做浅底高亮，便于扫视。首期接入仓库快速切换；封装可复用到其它搜索列表。

## 已确认规则

| 项 | 规则 |
|----|------|
| 字段 | 仓库名 + 路径（分组徽章不高亮） |
| 样式 | `rounded-sm bg-primary/15`（主题 token，非红） |
| 匹配 | 忽略大小写、整段连续子串；标出全部不重叠命中 |
| 空 query | 不高亮，原样展示 |

## 非目标

- 模糊 / 分词高亮
- 徽章文案高亮
- 改 cmdk 筛选算法

## 封装

1. `src/utils/textHighlight.ts` — `findContiguousMatchRanges(text, query)`
2. `src/components/common/HighlightText.tsx` — `text` / `query` / 可选 `className` / `markClassName`

## 接入

`RepositoryQuickSwitcher`：受控 `CommandInput` 的 query；名、路径包 `HighlightText`。

## 自检

- 无占位 / TODO
- 与「仅名 / 模糊匹配」方案无矛盾
- 范围仅快速切换 + 通用组件
