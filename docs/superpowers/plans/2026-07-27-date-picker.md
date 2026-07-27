# DatePicker 实现计划

> 对应规格：[2026-07-27-date-picker-design.md](../specs/2026-07-27-date-picker-design.md)

## 文件

| 文件 | 职责 |
|------|------|
| `src/components/ui/calendar.tsx`（CLI） | 官方 Calendar |
| `src/components/common/DatePicker.tsx` | 单日封装 |
| `src/components/git/HistoryAdvancedFilterPopover.tsx` | 替换 type=date |
| `src/i18n/locales/{zh-CN,en}/common.json` | placeholder / clear |
| `docs/development/ui-guidelines.md` | 已引入清单补 Calendar |

## Task 1：CLI 引入 calendar

```bash
pnpm dlx shadcn@latest add calendar
```

验收：`src/components/ui/calendar.tsx` 存在且非手写。

## Task 2：封装 DatePicker + i18n

实现 `DatePicker`；接入 common i18n。

## Task 3：历史高级筛选接入 + 自检

替换 since/until；`pnpm exec tsc --noEmit`。
