import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  ChevronUp,
  Columns2,
  FoldVertical,
  List,
  Menu,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SelectMenu } from "@/components/common/SelectMenu";
import { ToolIconButton } from "@/components/git/monacoPreviewShared";
import { cn } from "@/lib/utils";

import type { DiffViewPrefs } from "@/utils/diffViewPrefs";
import { TEXT_ENCODING_OPTIONS } from "@/utils/textEncodings";

export type DiffPreviewMode = "diff" | "file";
/** 差异布局：单栏（内联）/ 多栏（左右分栏） */
export type DiffPreviewLayout = "inline" | "sideBySide";

interface DiffPreviewToolbarProps {
  encoding: string;
  onEncodingChange: (encoding: string) => void;
  /** 二进制十六进制视图使用固定展示标签，不支持文本编码切换 */
  encodingDisabled?: boolean;
  encodingDisplayLabel?: string;
  mode: DiffPreviewMode;
  onModeChange: (mode: DiffPreviewMode) => void;
  /** 上一个 / 下一个差异块 */
  canNavigateHunk: boolean;
  onPrevHunk: () => void;
  onNextHunk: () => void;
  /** 如「1/1 冲突」，显示在上下导航旁 */
  navLabel?: string;
  /** 仅差异视图下可用的布局控件 */
  diffLayout: DiffPreviewLayout;
  onDiffLayoutChange: (layout: DiffPreviewLayout) => void;
  foldUnchanged: boolean;
  onFoldUnchangedChange: (fold: boolean) => void;
  /** 加载中或二进制时禁用布局类按钮 */
  diffToolsDisabled: boolean;
  /** 冲突文件视图：隐藏单栏/多栏/折叠（文件视图下无意义） */
  hideDiffLayoutTools?: boolean;
  /** 打开文件历史子窗；未提供时不展示「历史」 */
  onOpenHistory?: () => void;
  /** 「更多」菜单偏好 */
  viewPrefs: DiffViewPrefs;
  onViewPrefsChange: (patch: Partial<DiffViewPrefs>) => void;
  /** 无仓库路径 / 二进制等场景禁用行追溯 */
  lineBlameDisabled?: boolean;
}

/**
 * 文件 / 差异预览共用工具行：
 * 编码 · 文件/差异切换 · 上下差异 · 单栏/多栏/折叠 · 历史/更多
 */
export function DiffPreviewToolbar({
  encoding,
  onEncodingChange,
  encodingDisabled = false,
  encodingDisplayLabel,
  mode,
  onModeChange,
  canNavigateHunk,
  onPrevHunk,
  onNextHunk,
  navLabel,
  diffLayout,
  onDiffLayoutChange,
  foldUnchanged,
  onFoldUnchangedChange,
  diffToolsDisabled,
  hideDiffLayoutTools = false,
  onOpenHistory,
  viewPrefs,
  onViewPrefsChange,
  lineBlameDisabled = false,
}: DiffPreviewToolbarProps) {
  const { t } = useTranslation();
  const sideBySide = diffLayout === "sideBySide";

  return (
    <div className="border-border relative flex h-8 shrink-0 items-center border-b px-1.5">
      <SelectMenu
        value={encoding}
        onChange={onEncodingChange}
        ariaLabel={t("repo.diffEncodingSelect")}
        disabled={encodingDisabled}
        displayLabel={encodingDisplayLabel}
        size="sm"
        options={TEXT_ENCODING_OPTIONS.map((option) => ({
          value: option.id,
          label: option.label,
        }))}
        triggerClassName="border-border z-10 h-6 w-auto max-w-[9rem] shrink-0 rounded-md border px-1.5 text-[11px] font-normal tabular-nums shadow-none"
        contentClassName="min-w-[10rem] font-mono"
      />

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div
          className="bg-muted/60 pointer-events-auto flex items-center gap-0.5 rounded-md p-0.5"
          role="tablist"
          aria-label={t("repo.diffViewMode")}
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "file"}
            className={cn(
              "cursor-pointer rounded-sm px-2 py-0.5 text-[11px] transition-colors",
              mode === "file"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onModeChange("file")}
          >
            {t("repo.diffFileView")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "diff"}
            className={cn(
              "cursor-pointer rounded-sm px-2 py-0.5 text-[11px] transition-colors",
              mode === "diff"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onModeChange("diff")}
          >
            {t("repo.diffDiffView")}
          </button>
        </div>
      </div>

      <div className="z-10 ml-auto flex shrink-0 items-center gap-0.5">
        {navLabel ? (
          <span className="text-muted-foreground px-1 font-mono text-[11px] tabular-nums">
            {navLabel}
          </span>
        ) : null}
        <ToolIconButton
          label={t("repo.diffPrevChange")}
          disabled={!canNavigateHunk}
          onClick={onPrevHunk}
        >
          <ChevronUp aria-hidden="true" />
        </ToolIconButton>
        <ToolIconButton
          label={t("repo.diffNextChange")}
          disabled={!canNavigateHunk}
          onClick={onNextHunk}
        >
          <ChevronDown aria-hidden="true" />
        </ToolIconButton>

        {!hideDiffLayoutTools ? (
          <>
            <div className="bg-border mx-0.5 h-4 w-px shrink-0" aria-hidden="true" />

            <ToolIconButton
              label={t("repo.diffInline")}
              pressed={sideBySide === false}
              disabled={diffToolsDisabled}
              onClick={() => onDiffLayoutChange("inline")}
            >
              <List aria-hidden="true" />
            </ToolIconButton>
            <ToolIconButton
              label={t("repo.diffSideBySide")}
              pressed={sideBySide}
              disabled={diffToolsDisabled}
              onClick={() => onDiffLayoutChange("sideBySide")}
            >
              <Columns2 aria-hidden="true" />
            </ToolIconButton>
            <ToolIconButton
              label={t("repo.diffFoldUnchanged")}
              pressed={foldUnchanged}
              disabled={diffToolsDisabled}
              onClick={() => onFoldUnchangedChange(!foldUnchanged)}
            >
              <FoldVertical aria-hidden="true" />
            </ToolIconButton>
          </>
        ) : (
          <div className="bg-border mx-0.5 h-4 w-px shrink-0" aria-hidden="true" />
        )}

        {onOpenHistory ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground h-6 px-2 text-[11px]"
            title={t("repo.diffHistory")}
            onClick={onOpenHistory}
          >
            {t("repo.diffHistory")}
          </Button>
        ) : null}

        <DropdownMenu>
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground size-6 shrink-0 [&_svg]:size-3.5"
                  aria-label={t("repo.diffMore")}
                >
                  <Menu aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>{t("repo.diffMore")}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="min-w-40">
            <DropdownMenuCheckboxItem
              checked={viewPrefs.ignoreWhitespace}
              onCheckedChange={(checked) =>
                onViewPrefsChange({ ignoreWhitespace: Boolean(checked) })
              }
              onSelect={(event) => event.preventDefault()}
            >
              {t("repo.diffIgnoreWhitespace")}
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={viewPrefs.lineBlame}
              disabled={lineBlameDisabled}
              onCheckedChange={(checked) =>
                onViewPrefsChange({ lineBlame: Boolean(checked) })
              }
              onSelect={(event) => event.preventDefault()}
            >
              {t("repo.diffLineBlame")}
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={viewPrefs.wordWrap}
              onCheckedChange={(checked) =>
                onViewPrefsChange({ wordWrap: Boolean(checked) })
              }
              onSelect={(event) => event.preventDefault()}
            >
              {t("repo.diffWordWrap")}
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={viewPrefs.monospace}
              onCheckedChange={(checked) =>
                onViewPrefsChange({ monospace: Boolean(checked) })
              }
              onSelect={(event) => event.preventDefault()}
            >
              {t("repo.diffMonospace")}
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
