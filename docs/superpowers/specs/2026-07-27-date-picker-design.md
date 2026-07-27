# 单日 DatePicker 设计

> 日期：2026-07-27  
> 状态：已确认（方案 3：先单日，区间后补）

## 背景

历史高级筛选的「开始/结束日期」使用原生 `input[type=date]`，跨平台观感不一致。项目要求基础控件走 shadcn CLI；领域封装放 `components/common`。

## 目标

1. 用官方 CLI 引入 `calendar`（含官方依赖，不手写 `ui/`）。
2. 在 `src/components/common/DatePicker.tsx` 封装**单日**选择器。
3. 首个接入点：`HistoryAdvancedFilterPopover` 的 since / until。
4. placeholder 标准专业：中文「请选择日期」/ 英文「Select a date」；禁止示例日期。

## 非目标（本期）

- `DateRangePicker` / `mode="range"`（后续另开）
- 改 Git `--since` / `--until` 契约或 store 形状
- 手改 `src/components/ui/*`

## API

```ts
interface DatePickerProps {
  value: string | null; // YYYY-MM-DD，本地日历日
  onChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  /** 触发器 aria-label；缺省用 placeholder */
  "aria-label"?: string;
}
```

- 触发器：Button + 日历图标；空值显示 placeholder，有值显示 `YYYY-MM-DD`（与现有筛选用字符串一致）。
- Popover + 官方 Calendar（含月份/年份下拉若 CLI 默认支持）。
- 选中日期后关闭 Popover；允许清空（触发器旁或日历内 clear，保持可回到 `null`）。

## 值格式

继续使用 `YYYY-MM-DD` 字符串，与 `HistoryAdvancedFilters.since/until`、`git log --since/--until` 对齐。解析/格式化用已有 `dayjs`，避免引入第二套日期库（若 CLI 强制 `date-fns` 仅为 react-day-picker 依赖，可接受）。

## i18n

| key | zh-CN | en |
|-----|-------|-----|
| `common.datePickerPlaceholder` | 请选择日期 | Select a date |
| `common.datePickerClear` | 清除 | Clear |

## 验收

- [x] `pnpm dlx shadcn@latest add calendar` 成功，`ui/calendar` 仅官方产物（本机用文档规避：临时目录 `shadcn` + `zod@3.25.76`）
- [x] 高级筛选 since/until 为 DatePicker，校验逻辑不变
- [x] placeholder 无示例文案
- [x] `tsc` 通过
