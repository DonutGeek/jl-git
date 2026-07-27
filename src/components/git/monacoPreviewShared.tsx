import { useEffect, useState, type ReactNode, type RefCallback } from "react";
import type { DiffOnMount } from "@monaco-editor/react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Monaco 文件 / 差异预览共享逻辑
 * 由 TextDiffPreview 使用（工作区变更 / 历史提交对比 / 分支比较）。
 */

export interface HostSize {
  width: number;
  height: number;
}

/** 无扩展名或特殊文件名 → Monaco language id */
const SPECIAL_FILENAME_LANGUAGE: Readonly<Record<string, string>> = {
  dockerfile: "dockerfile",
  containerfile: "dockerfile",
  makefile: "shell",
  gnumakefile: "shell",
  "cmakelists.txt": "plaintext",
  gemfile: "ruby",
  rakefile: "ruby",
  podfile: "ruby",
  brewfile: "ruby",
  ".gitignore": "ini",
  ".gitattributes": "ini",
  ".gitmodules": "ini",
  ".dockerignore": "ini",
  ".editorconfig": "ini",
  ".env": "ini",
  ".npmrc": "ini",
  ".yarnrc": "ini",
};

/**
 * 扩展名 → Monaco language id（仅内置语言；无对应语法时选最接近的回退）。
 * Vue/Svelte/Astro 等无内置语法，按 HTML 高亮。
 */
const EXTENSION_LANGUAGE: Readonly<Record<string, string>> = {
  // Web / TS / JS
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  jsonc: "json",
  json5: "json",
  html: "html",
  htm: "html",
  xhtml: "html",
  vue: "html",
  svelte: "html",
  astro: "html",
  hbs: "handlebars",
  handlebars: "handlebars",
  ejs: "html",
  njk: "html",
  pug: "pug",
  jade: "pug",
  css: "css",
  scss: "scss",
  sass: "scss",
  less: "less",
  styl: "css",
  // 文档 / 配置
  md: "markdown",
  mdx: "markdown",
  markdown: "markdown",
  rst: "restructuredtext",
  yml: "yaml",
  yaml: "yaml",
  toml: "ini",
  ini: "ini",
  cfg: "ini",
  conf: "ini",
  properties: "ini",
  env: "ini",
  // 系统 / Shell
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  fish: "shell",
  ksh: "shell",
  ps1: "powershell",
  psm1: "powershell",
  psd1: "powershell",
  bat: "bat",
  cmd: "bat",
  // 后端 / 系统语言
  py: "python",
  pyw: "python",
  pyi: "python",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  scala: "scala",
  sc: "scala",
  groovy: "java",
  gradle: "java",
  php: "php",
  phtml: "php",
  rb: "ruby",
  rake: "ruby",
  gemspec: "ruby",
  swift: "swift",
  cs: "csharp",
  fs: "fsharp",
  fsx: "fsharp",
  fsi: "fsharp",
  vb: "vb",
  c: "cpp",
  h: "cpp",
  cc: "cpp",
  cpp: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  hxx: "cpp",
  hh: "cpp",
  m: "objective-c",
  mm: "objective-c",
  dart: "dart",
  lua: "lua",
  r: "r",
  jl: "julia",
  ex: "elixir",
  exs: "elixir",
  erl: "plaintext",
  hs: "plaintext",
  clj: "clojure",
  cljs: "clojure",
  cljc: "clojure",
  edn: "clojure",
  pl: "perl",
  pm: "perl",
  t: "perl",
  // 数据 / 查询 / IDL
  sql: "sql",
  mysql: "mysql",
  pgsql: "pgsql",
  graphql: "graphql",
  gql: "graphql",
  proto: "protobuf",
  tf: "hcl",
  tfvars: "hcl",
  hcl: "hcl",
  sol: "solidity",
  // 标记 / 其它
  xml: "xml",
  svg: "xml",
  xsl: "xml",
  xsd: "xml",
  plist: "xml",
  cshtml: "razor",
  razor: "razor",
  dockerfile: "dockerfile",
};

/** 根据扩展名 / 特殊文件名推断 Monaco language id */
export function languageFromPath(filePath: string): string {
  const name = filePath.split(/[/\\]/).pop() ?? filePath;
  const lower = name.toLowerCase();

  const special = SPECIAL_FILENAME_LANGUAGE[lower];
  if (special) {
    return special;
  }
  // Dockerfile.dev / Dockerfile.prod
  if (lower.startsWith("dockerfile")) {
    return "dockerfile";
  }
  // .env.local / .env.production
  if (lower === ".env" || lower.startsWith(".env.")) {
    return "ini";
  }

  const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".") + 1) : "";
  return EXTENSION_LANGUAGE[ext] ?? "plaintext";
}

export function readMonoFont(): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim();
  return value || "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
}

/** 非等宽：走界面 sans token */
export function readSansFont(): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue("--font-sans").trim();
  return value || "ui-sans-serif, system-ui, sans-serif";
}

export function isDocumentDark(): boolean {
  return document.documentElement.classList.contains("dark");
}

/** 从文本内容推断换行符展示 */
export function detectLineEnding(text: string): "LF" | "CRLF" | "CR" {
  if (text.includes("\r\n")) {
    return "CRLF";
  }
  if (text.includes("\r")) {
    return "CR";
  }
  return "LF";
}

/** 跳转到上一个 / 下一个差异块（文件内 hunk，非文件列表） */
export function navigateDiffHunk(
  editor: Parameters<DiffOnMount>[0],
  direction: "prev" | "next",
): void {
  // 新版 Monaco 自带 goToDiff；类型定义可能未收录
  const withGoToDiff = editor as Parameters<DiffOnMount>[0] & {
    goToDiff?: (dir: "next" | "previous") => void;
  };
  if (typeof withGoToDiff.goToDiff === "function") {
    withGoToDiff.goToDiff(direction === "next" ? "next" : "previous");
    return;
  }

  const changes = editor.getLineChanges();
  if (!changes || changes.length === 0) {
    return;
  }

  const modified = editor.getModifiedEditor();
  const currentLine = modified.getPosition()?.lineNumber ?? 1;

  let currentIndex = -1;
  for (let i = 0; i < changes.length; i += 1) {
    const change = changes[i];
    if (!change) {
      continue;
    }
    const start = change.modifiedStartLineNumber;
    const end =
      change.modifiedEndLineNumber > 0
        ? change.modifiedEndLineNumber
        : change.modifiedStartLineNumber;
    if (start > 0 && currentLine >= start && currentLine <= end) {
      currentIndex = i;
      break;
    }
  }

  let targetIndex = -1;
  if (direction === "next") {
    if (currentIndex >= 0) {
      targetIndex = currentIndex + 1;
    } else {
      targetIndex = changes.findIndex((change) => change.modifiedStartLineNumber > currentLine);
    }
  } else if (currentIndex >= 0) {
    targetIndex = currentIndex - 1;
  } else {
    for (let i = changes.length - 1; i >= 0; i -= 1) {
      const change = changes[i];
      if (change && change.modifiedStartLineNumber < currentLine) {
        targetIndex = i;
        break;
      }
    }
  }

  const target = targetIndex >= 0 ? changes[targetIndex] : undefined;
  if (!target) {
    return;
  }

  const line =
    target.modifiedStartLineNumber > 0
      ? target.modifiedStartLineNumber
      : Math.max(1, target.originalStartLineNumber);

  modified.revealLineInCenter(line);
  modified.setPosition({ lineNumber: line, column: 1 });
  modified.focus();
}

/** 差异加载完成后定位到文件中的首个差异块。 */
export function revealFirstDiffHunk(editor: Parameters<DiffOnMount>[0]): void {
  const firstChange = editor.getLineChanges()?.[0];
  if (!firstChange) {
    return;
  }

  const modified = editor.getModifiedEditor();
  const preferredLine =
    firstChange.modifiedStartLineNumber > 0
      ? firstChange.modifiedStartLineNumber
      : firstChange.originalStartLineNumber;
  const lineCount = modified.getModel()?.getLineCount() ?? 1;
  const line = Math.min(Math.max(1, preferredLine), lineCount);

  modified.revealLineInCenter(line);
  modified.setPosition({ lineNumber: line, column: 1 });
  modified.focus();
}

export const monacoCommonOptions = {
  readOnly: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  fontSize: 12,
  lineNumbers: "on" as const,
  automaticLayout: false,
  wordWrap: "off" as const,
  renderLineHighlight: "none" as const,
  overviewRulerLanes: 0,
  overviewRulerBorder: false,
  hideCursorInOverviewRuler: true,
  renderOverviewRuler: false,
  scrollbar: {
    verticalScrollbarSize: 8,
    horizontalScrollbarSize: 8,
    useShadows: false,
    vertical: "auto" as const,
  },
};

/** 文件视图：Monaco 原生 minimap（字符缩略，非自定义灰条） */
export const monacoFileMinimapOptions = {
  enabled: true,
  side: "right" as const,
  size: "proportional" as const,
  showSlider: "mouseover" as const,
  renderCharacters: true,
  maxColumn: 120,
  scale: 1,
};

/**
 * 左右 Diff 滚动联动：滚一侧另一侧跟随；左侧隐藏竖条，视觉上共用右侧滚动条。
 */
export function bindDiffScrollSync(diffEditor: Parameters<DiffOnMount>[0]): () => void {
  const original = diffEditor.getOriginalEditor();
  const modified = diffEditor.getModifiedEditor();

  // 左侧不单独显示竖滚动条，滚轮仍可驱动（由同步传到右侧）
  original.updateOptions({
    minimap: { enabled: false },
    scrollbar: {
      vertical: "hidden",
      horizontal: "auto",
      handleMouseWheel: true,
      alwaysConsumeMouseWheel: false,
      useShadows: false,
      verticalScrollbarSize: 0,
    },
  });
  modified.updateOptions({
    minimap: { enabled: false },
    scrollbar: {
      vertical: "auto",
      horizontal: "auto",
      handleMouseWheel: true,
      useShadows: false,
      verticalScrollbarSize: 8,
      horizontalScrollbarSize: 8,
    },
  });

  let syncing = false;

  const syncFromOriginal = original.onDidScrollChange((event) => {
    if (syncing) {
      return;
    }
    syncing = true;
    modified.setScrollTop(event.scrollTop);
    modified.setScrollLeft(event.scrollLeft);
    syncing = false;
  });

  const syncFromModified = modified.onDidScrollChange((event) => {
    if (syncing) {
      return;
    }
    syncing = true;
    original.setScrollTop(event.scrollTop);
    original.setScrollLeft(event.scrollLeft);
    syncing = false;
  });

  return () => {
    syncFromOriginal.dispose();
    syncFromModified.dispose();
  };
}

/** 用 callback ref 测量宿主；remeasureKey 变化时强制重测（如文件/差异视图切换） */
export function useMonacoHostSize(remeasureKey: string): {
  setHost: RefCallback<HTMLDivElement>;
  size: HostSize;
} {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState<HostSize>({ width: 0, height: 0 });

  useEffect(() => {
    // 切换视图时先清零，避免沿用更窄侧栏时的旧宽度留下空白
    setSize({ width: 0, height: 0 });
  }, [remeasureKey]);

  useEffect(() => {
    if (!host) {
      setSize({ width: 0, height: 0 });
      return;
    }

    const update = (): void => {
      const rect = host.getBoundingClientRect();
      const width = Math.max(0, Math.floor(rect.width));
      const height = Math.max(0, Math.floor(rect.height));
      setSize((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height },
      );
    };

    update();
    // 侧栏宽度变化后，等 flex 布局稳定再测一次
    const raf = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(update);
    });
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => {
      window.cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [host, remeasureKey]);

  return { setHost, size };
}

interface ToolIconButtonProps {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  pressed?: boolean;
  children: ReactNode;
}

export function ToolIconButton({
  label,
  onClick,
  disabled,
  pressed,
  children,
}: ToolIconButtonProps) {
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "size-6 shrink-0 [&_svg]:size-3.5",
            pressed
              ? "bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
          aria-label={label}
          aria-pressed={pressed}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent align="center">{label}</TooltipContent>
    </Tooltip>
  );
}
