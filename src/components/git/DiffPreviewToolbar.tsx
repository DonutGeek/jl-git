import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  ChevronUp,
  Columns2,
  FoldVertical,
  List,
  Menu,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { SelectMenu } from "@/components/ui/select-menu";
import { ToolIconButton } from "@/components/git/monacoPreviewShared";
import { cn } from "@/lib/utils";

import { TEXT_ENCODING_OPTIONS } from "@/utils/textEncodings";

export type DiffPreviewMode = "diff" | "file";
/** 差异布局：单栏（内联）/ 多栏（左右分栏） */
export type DiffPreviewLayout = "inline" | "sideBySide";

interface DiffPreviewToolbarProps {
  encoding: string;
  onEncodingChange: (encoding: string) => void;
  mode: DiffPreviewMode;
  onModeChange: (mode: DiffPreviewMode) => void;
  /** 上一个 / 下一个差异块 */
  canNavigateHunk: boolean;
  onPrevHunk: () => void;
  onNextHunk: () => void;
  /** 仅差异视图下可用的布局控件 */
  diffLayout: DiffPreviewLayout;
  onDiffLayoutChange: (layout: DiffPreviewLayout) => void;
  foldUnchanged: boolean;
  onFoldUnchangedChange: (fold: boolean) => void;
  /** 加载中或二进制时禁用布局类按钮 */
  diffToolsDisabled: boolean;
}

/**
 * 文件 / 差异预览共用工具行：
 * 编码 · 文件/差异切换 · 上下差异 · 单栏/多栏/折叠 · 追溯/历史/更多
 */
export function DiffPreviewToolbar({
  encoding,
  onEncodingChange,
  mode,
  onModeChange,
  canNavigateHunk,
  onPrevHunk,
  onNextHunk,
  diffLayout,
  onDiffLayoutChange,
  foldUnchanged,
  onFoldUnchangedChange,
  diffToolsDisabled,
}: DiffPreviewToolbarProps) {
  const { t } = useTranslation();
  const sideBySide = diffLayout === "sideBySide";

  function handleComingSoon(): void {
    toast.message(t("repo.diffComingSoon"));
  }

  return (
    <div className="border-border relative flex h-8 shrink-0 items-center border-b px-1.5">
      <SelectMenu
        value={encoding}
        onChange={onEncodingChange}
        ariaLabel={t("repo.diffEncodingSelect")}
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

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground h-6 px-2 text-[11px]"
          disabled
          title={t("repo.diffComingSoon")}
          onClick={handleComingSoon}
        >
          {t("repo.diffBlame")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground h-6 px-2 text-[11px]"
          disabled
          title={t("repo.diffComingSoon")}
          onClick={handleComingSoon}
        >
          {t("repo.diffHistory")}
        </Button>
        <ToolIconButton label={t("repo.diffMore")} onClick={handleComingSoon}>
          <Menu aria-hidden="true" />
        </ToolIconButton>
      </div>
    </div>
  );
}
