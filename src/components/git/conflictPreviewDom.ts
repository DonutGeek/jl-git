import type { Monaco, OnMount } from "@monaco-editor/react";

import type { ConflictSideMeta } from "@/types/git";
import type { ConflictHunk, ConflictHunkAction } from "@/utils/gitConflict";

type MonacoEditor = Parameters<OnMount>[0];
type MonacoTextModel = NonNullable<ReturnType<MonacoEditor["getModel"]>>;
type MonacoDecoration = Parameters<MonacoEditor["deltaDecorations"]>[1][number];
type MonacoOverlayWidget = Parameters<MonacoEditor["addOverlayWidget"]>[0];
type MonacoContentWidget = Parameters<MonacoEditor["addContentWidget"]>[0];

export const CONFLICT_ACTIONS_ZONE_HEIGHT = 32;

/** 冲突块内「采用…」可点击按钮（含 hover / active） */
export function createConflictActionButton(
  label: string,
  onClick: () => void,
  disabled = false,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "jlgit-conflict-action-btn";
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener("mousedown", (event) => {
    // 避免编辑器抢焦点吞掉后续 click
    event.preventDefault();
    event.stopPropagation();
  });
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!button.disabled) {
      onClick();
    }
  });
  return button;
}

export function createConflictActionSep(): HTMLSpanElement {
  const sep = document.createElement("span");
  sep.className = "jlgit-conflict-actions-sep";
  sep.textContent = "|";
  sep.setAttribute("aria-hidden", "true");
  return sep;
}

/** View Zone 只占位（文本层下方收不到点击） */
export function createConflictActionsSpacer(): HTMLElement {
  const spacer = document.createElement("div");
  spacer.className = "jlgit-conflict-actions-spacer";
  spacer.setAttribute("aria-hidden", "true");
  return spacer;
}

export interface ConflictActionsOverlay {
  zoneId: string;
  widget: MonacoOverlayWidget;
  setBusy: (busy: boolean) => void;
  setActive: (active: boolean) => void;
  layout: () => void;
  onDomNodeTop: (top: number) => void;
  onComputedHeight: (height: number) => void;
  spacer: HTMLElement;
}

/**
 * View Zone 占位 + Overlay Widget 承载按钮。
 * Monaco 把 View Zone 画在行文本下方，zone 内 DOM 的 hover/click 不可靠；
 * Overlay（getPosition=null 自行定位）盖在占位条上，可正常 hover / 点击。
 */
export function createConflictActionsOverlay(options: {
  editor: MonacoEditor;
  id: string;
  labels: { ours: string; theirs: string; both: string };
  disabled: boolean;
  active: boolean;
  onAction: (action: ConflictHunkAction) => void;
}): Omit<ConflictActionsOverlay, "zoneId"> {
  const root = document.createElement("div");
  root.className = "jlgit-conflict-actions";
  root.dataset.active = options.active ? "true" : "false";
  root.style.position = "absolute";
  root.style.boxSizing = "border-box";
  root.append(
    createConflictActionButton(
      options.labels.ours,
      () => options.onAction("ours"),
      options.disabled,
    ),
    createConflictActionSep(),
    createConflictActionButton(
      options.labels.theirs,
      () => options.onAction("theirs"),
      options.disabled,
    ),
    createConflictActionSep(),
    createConflictActionButton(
      options.labels.both,
      () => options.onAction("both"),
      options.disabled,
    ),
  );

  const spacer = createConflictActionsSpacer();
  let zoneTop = 0;
  let zoneHeight = CONFLICT_ACTIONS_ZONE_HEIGHT;

  const syncLayoutBox = (): void => {
    const info = options.editor.getLayoutInfo();
    root.style.top = `${zoneTop}px`;
    root.style.left = `${info.contentLeft}px`;
    root.style.width = `${info.contentWidth}px`;
    root.style.height = `${zoneHeight}px`;
  };

  const widget: MonacoOverlayWidget = {
    getId: () => options.id,
    getDomNode: () => root,
    // null = 自行定位（与 View Zone onDomNodeTop 对齐）
    getPosition: () => null,
  };

  return {
    spacer,
    widget,
    onDomNodeTop: (top) => {
      zoneTop = top;
      syncLayoutBox();
    },
    onComputedHeight: (height) => {
      zoneHeight = height;
      syncLayoutBox();
    },
    layout: () => {
      syncLayoutBox();
    },
    setBusy: (busy) => {
      root.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
        button.disabled = busy;
      });
    },
    setActive: (active) => {
      root.dataset.active = active ? "true" : "false";
    },
  };
}

export interface ConflictMarkerLabels {
  oursKind: string;
  theirsKind: string;
  oursMeta?: ConflictSideMeta | null;
  theirsMeta?: ConflictSideMeta | null;
  /** 本地侧展示后缀，如「(本地)」 */
  oursLocalSuffix?: string;
}

export interface ConflictMarkerLabelParts {
  /** 空格开头：`(当前更改) daily(本地) author time` */
  prefix: string;
  shortId?: string;
}

/** 拼出标记行元数据（短哈希单独渲染，前面挂 commit 图标） */
export function formatConflictMarkerLabelParts(
  kindLabel: string,
  meta: ConflictSideMeta | null | undefined,
  options?: { localSuffix?: string },
): ConflictMarkerLabelParts {
  const parts: string[] = [`(${kindLabel})`];
  const branch = meta?.label?.trim();
  if (branch) {
    const suffix = options?.localSuffix?.trim();
    parts.push(suffix ? `${branch}${suffix}` : branch);
  }
  if (meta?.authorName?.trim()) {
    parts.push(meta.authorName.trim());
  }
  if (meta?.authoredAt?.trim()) {
    parts.push(formatConflictAuthoredAt(meta.authoredAt));
  }
  const shortId = meta?.shortId?.trim();
  return {
    prefix: ` ${parts.join(" ")}`,
    shortId: shortId || undefined,
  };
}

function formatConflictAuthoredAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** lucide GitCommitHorizontal 同源 path，用于非 React DOM */
function createGitCommitIconElement(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "12");
  svg.setAttribute("height", "12");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("jlgit-conflict-marker-commit-icon");

  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("cx", "12");
  circle.setAttribute("cy", "12");
  circle.setAttribute("r", "3");
  const left = document.createElementNS("http://www.w3.org/2000/svg", "line");
  left.setAttribute("x1", "3");
  left.setAttribute("x2", "9");
  left.setAttribute("y1", "12");
  left.setAttribute("y2", "12");
  const right = document.createElementNS("http://www.w3.org/2000/svg", "line");
  right.setAttribute("x1", "15");
  right.setAttribute("x2", "21");
  right.setAttribute("y1", "12");
  right.setAttribute("y2", "12");
  svg.append(circle, left, right);
  return svg;
}

/**
 * 标记行末尾元数据标签。
 * 不用 decoration.after：本地类型/部分加载路径下注入文案不可靠，改 Content Widget。
 */
export function createConflictMarkerLabelWidget(options: {
  monaco: Monaco;
  id: string;
  lineNumber: number;
  column: number;
  parts: ConflictMarkerLabelParts;
  /** 与编辑器行高对齐，避免悬浮字偏上/偏下 */
  lineHeight: number;
  /** 与编辑器等宽字体一致，空格补齐才能对齐 */
  fontFamily: string;
}): MonacoContentWidget {
  const root = document.createElement("span");
  root.className = "jlgit-conflict-marker-label";
  root.setAttribute("aria-hidden", "true");
  root.style.height = `${options.lineHeight}px`;
  root.style.lineHeight = `${options.lineHeight}px`;
  root.style.fontFamily = options.fontFamily;
  root.append(document.createTextNode(options.parts.prefix));

  if (options.parts.shortId) {
    const hash = document.createElement("span");
    hash.className = "jlgit-conflict-marker-hash";
    hash.append(createGitCommitIconElement());
    const idText = document.createElement("span");
    idText.textContent = options.parts.shortId;
    hash.append(idText);
    root.append(hash);
  }

  return {
    allowEditorOverflow: true,
    getId: () => options.id,
    getDomNode: () => root,
    getPosition: () => ({
      position: {
        lineNumber: options.lineNumber,
        column: options.column,
      },
      preference: [options.monaco.editor.ContentWidgetPositionPreference.EXACT],
    }),
  };
}

/** 为每个冲突块生成 HEAD / 传入侧 行尾元数据 widget */
export function createConflictMarkerLabelWidgets(
  monaco: Monaco,
  editor: MonacoEditor,
  hunks: ConflictHunk[],
  model: MonacoTextModel | null,
  labels: ConflictMarkerLabels,
  idPrefix: string,
): MonacoContentWidget[] {
  const oursParts = formatConflictMarkerLabelParts(labels.oursKind, labels.oursMeta, {
    localSuffix: labels.oursLocalSuffix,
  });
  const theirsParts = formatConflictMarkerLabelParts(labels.theirsKind, labels.theirsMeta);
  // 估算行高，使 widget 与正文垂直对齐
  const measured = editor.getTopForLineNumber(2) - editor.getTopForLineNumber(1);
  const lineHeight = Math.max(14, measured > 0 ? measured : 18);
  const host = editor.getDomNode();
  const fontFamily = host
    ? getComputedStyle(host).fontFamily || "ui-monospace, monospace"
    : "ui-monospace, monospace";
  const widgets: MonacoContentWidget[] = [];

  hunks.forEach((hunk, index) => {
    const oursCol = model?.getLineMaxColumn(hunk.startLine) ?? 1;
    const theirsCol = model?.getLineMaxColumn(hunk.endLine) ?? 1;
    // 紧贴标记行末尾（HEAD / 分支名后），不做列对齐补空格
    widgets.push(
      createConflictMarkerLabelWidget({
        monaco,
        id: `${idPrefix}.ours.${hunk.startLine}.${index}`,
        lineNumber: hunk.startLine,
        column: oursCol,
        parts: oursParts,
        lineHeight,
        fontFamily,
      }),
      createConflictMarkerLabelWidget({
        monaco,
        id: `${idPrefix}.theirs.${hunk.endLine}.${index}`,
        lineNumber: hunk.endLine,
        column: theirsCol,
        parts: theirsParts,
        lineHeight,
        fontFamily,
      }),
    );
  });

  return widgets;
}

/** 当前侧绿 / 传入侧蓝（行尾文案见 createConflictMarkerLabelWidgets） */
export function buildConflictDecorations(
  monaco: Monaco,
  hunks: ConflictHunk[],
): MonacoDecoration[] {
  const decorations: MonacoDecoration[] = [];

  for (const hunk of hunks) {
    decorations.push({
      range: new monaco.Range(hunk.startLine, 1, hunk.startLine, 1),
      options: {
        isWholeLine: true,
        className: "jlgit-conflict-ours-marker",
        linesDecorationsClassName: "jlgit-conflict-gutter-ours",
      },
    });

    if (hunk.separatorLine > hunk.startLine + 1) {
      decorations.push({
        range: new monaco.Range(hunk.startLine + 1, 1, hunk.separatorLine - 1, 1),
        options: {
          isWholeLine: true,
          className: "jlgit-conflict-ours",
          linesDecorationsClassName: "jlgit-conflict-gutter-ours",
        },
      });
    }

    decorations.push({
      range: new monaco.Range(hunk.separatorLine, 1, hunk.separatorLine, 1),
      options: {
        isWholeLine: true,
        className: "jlgit-conflict-sep",
      },
    });

    if (hunk.endLine > hunk.separatorLine + 1) {
      decorations.push({
        range: new monaco.Range(hunk.separatorLine + 1, 1, hunk.endLine - 1, 1),
        options: {
          isWholeLine: true,
          className: "jlgit-conflict-theirs",
          linesDecorationsClassName: "jlgit-conflict-gutter-theirs",
        },
      });
    }

    decorations.push({
      range: new monaco.Range(hunk.endLine, 1, hunk.endLine, 1),
      options: {
        isWholeLine: true,
        className: "jlgit-conflict-theirs-marker",
        linesDecorationsClassName: "jlgit-conflict-gutter-theirs",
      },
    });
  }

  return decorations;
}
