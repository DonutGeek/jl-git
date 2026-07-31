/** 半开区间 [start, end) */
export interface TextMatchRange {
  start: number;
  end: number;
}

function mergeRanges(ranges: TextMatchRange[]): TextMatchRange[] {
  if (ranges.length === 0) {
    return [];
  }
  const sorted = [...ranges].sort((left, right) => left.start - right.start);
  const first = sorted[0];
  if (!first) {
    return [];
  }
  const merged: TextMatchRange[] = [{ ...first }];
  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index];
    const last = merged[merged.length - 1];
    if (!current || !last) {
      continue;
    }
    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}

/**
 * 忽略大小写的整段连续子串命中区间（不重叠，从左到右全部标出）。
 * query 去首尾空白后为空则返回 []。
 * 含 `|` 时按 OR 多关键词分别匹配（与历史搜索一致）。
 */
export function findContiguousMatchRanges(text: string, query: string): TextMatchRange[] {
  const raw = query.trim();
  if (!raw) {
    return [];
  }

  const terms = raw.includes("|")
    ? raw
        .split("|")
        .map((term) => term.trim())
        .filter(Boolean)
    : [raw];

  if (terms.length === 0) {
    return [];
  }

  const haystack = text.toLocaleLowerCase();
  const ranges: TextMatchRange[] = [];

  for (const term of terms) {
    const needleLower = term.toLocaleLowerCase();
    let from = 0;
    while (from <= haystack.length - needleLower.length) {
      const index = haystack.indexOf(needleLower, from);
      if (index === -1) {
        break;
      }
      ranges.push({ start: index, end: index + needleLower.length });
      from = index + needleLower.length;
    }
  }

  return mergeRanges(ranges);
}

/** 忽略大小写的整段连续子串是否命中（与高亮规则一致；query 空视为全匹配） */
export function matchesContiguousQuery(text: string, query: string): boolean {
  const needle = query.trim();
  if (!needle) {
    return true;
  }
  return text.toLocaleLowerCase().includes(needle.toLocaleLowerCase());
}
