import type { AgentMention } from "@/types/ai";

export type AgentMessageMentionSegment =
  { type: "text"; value: string } | { type: "mention"; mention: AgentMention };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 与 Composer displayTransform 对齐：@ + 可选 NBSP + 名称 + 可选 NBSP */
function buildAtMentionPattern(name: string): RegExp {
  const escaped = escapeRegExp(name);
  return new RegExp(`@\\u00A0*${escaped}\\u00A0*`, "u");
}

function isBoundaryChar(char: string | undefined): boolean {
  if (char === undefined || char === "") {
    return true;
  }
  return /\s/u.test(char);
}

/** 无 @ 时：名称两侧须为空白/首尾，避免正文短语误命中技能名（如「简历生成」） */
function findBareMentionInSlice(
  slice: string,
  name: string,
): { index: number; length: number } | null {
  let from = 0;
  while (from <= slice.length - name.length) {
    const index = slice.indexOf(name, from);
    if (index < 0) {
      return null;
    }
    const before = index === 0 ? undefined : slice[index - 1];
    const after = index + name.length >= slice.length ? undefined : slice[index + name.length];
    if (isBoundaryChar(before) && isBoundaryChar(after)) {
      return { index, length: name.length };
    }
    from = index + 1;
  }
  return null;
}

function findMentionInSlice(slice: string, name: string): { index: number; length: number } | null {
  if (!name) {
    return null;
  }
  const atMatch = buildAtMentionPattern(name).exec(slice);
  if (atMatch) {
    return { index: atMatch.index, length: atMatch[0].length };
  }
  return findBareMentionInSlice(slice, name);
}

/**
 * 按 mentions 把纯文本拆成「文本 / 提及标签」片段。
 * 每个 mention 最多命中一次（从左到右），避免正文里同名二次误标。
 */
export function splitContentByMentions(
  content: string,
  mentions: readonly AgentMention[] | undefined,
): AgentMessageMentionSegment[] {
  if (!content) {
    return [];
  }
  if (!mentions || mentions.length === 0) {
    return [{ type: "text", value: content }];
  }

  const remaining = [...mentions];
  const segments: AgentMessageMentionSegment[] = [];
  let cursor = 0;

  while (cursor < content.length && remaining.length > 0) {
    let best: {
      index: number;
      length: number;
      mentionIndex: number;
      mention: AgentMention;
    } | null = null;

    const slice = content.slice(cursor);
    for (let i = 0; i < remaining.length; i += 1) {
      const mention = remaining[i];
      const hit = findMentionInSlice(slice, mention.name);
      if (!hit) {
        continue;
      }
      const absIndex = cursor + hit.index;
      if (!best || absIndex < best.index || (absIndex === best.index && hit.length > best.length)) {
        best = {
          index: absIndex,
          length: hit.length,
          mentionIndex: i,
          mention,
        };
      }
    }

    if (!best) {
      break;
    }

    if (best.index > cursor) {
      segments.push({ type: "text", value: content.slice(cursor, best.index) });
    }
    segments.push({ type: "mention", mention: best.mention });
    remaining.splice(best.mentionIndex, 1);
    cursor = best.index + best.length;
  }

  if (cursor < content.length) {
    segments.push({ type: "text", value: content.slice(cursor) });
  }

  return segments.length > 0 ? segments : [{ type: "text", value: content }];
}
