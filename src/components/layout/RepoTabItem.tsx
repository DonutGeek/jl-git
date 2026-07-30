import type { KeyboardEvent, MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Copy, ExternalLink, FolderOpen, Link, SquarePen, Terminal, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { ContextMenuSubTrigger } from "@/components/common/ContextMenuSubTrigger";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { systemOpenService } from "@/services/system/system.open";
import { detectAppOs } from "@/services/window/windowChrome";
import type { OpenTab } from "@/store/useOpenTabsStore";
import { toUserMessage } from "@/types/error";
import type { Project } from "@/types/project";
import { useContextMenuOpen } from "@/utils/contextMenuHighlight";
import { revealInFileManagerLabel } from "@/utils/platformLabels";
import type { RepoTabWorkspaceId } from "@/utils/repoTabGroups";
import { workspaceColorRing } from "@/utils/workspaceColor";

export interface TabDisplayItem {
  id: string;
  label: string;
  title: string;
  type: OpenTab["type"];
  workspaceId: RepoTabWorkspaceId;
  project?: Project;
}

export interface TabDragData {
  type: "tab";
  workspaceId: RepoTabWorkspaceId;
  projectId: string | null;
}

interface TabGroupDragData {
  type: "group";
  workspaceId: RepoTabWorkspaceId;
}

export type RepoTabDragData = TabDragData | TabGroupDragData;

export function readRepoTabDragData(value: unknown): RepoTabDragData | null {
  if (!value || typeof value !== "object" || !("type" in value)) {
    return null;
  }
  const type = value.type;
  if (type !== "tab" && type !== "group") {
    return null;
  }
  return value as RepoTabDragData;
}

interface RepoTabChromeProps {
  tab: TabDisplayItem;
  isActive: boolean;
  dragging?: boolean;
  /** 拖拽幽灵边框色（命名组时用分组色） */
  dragBorderColor?: string;
  onSelect?: (tabId: string) => void;
  onClose?: (event: MouseEvent | KeyboardEvent, tabId: string) => void;
  closeLabel?: string;
}

export function RepoTabChrome({
  tab,
  isActive,
  dragging = false,
  dragBorderColor,
  onSelect,
  onClose,
  closeLabel,
}: RepoTabChromeProps) {
  return (
    <div
      className={cn(
        "group relative flex h-7 max-w-44 items-center rounded-md font-mono text-xs leading-none transition-colors",
        isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent/60",
        dragging && "bg-primary/10 text-primary",
      )}
      style={
        dragging
          ? {
              boxShadow: `0 0 0 1px ${
                dragBorderColor ? workspaceColorRing(dragBorderColor) : "var(--border)"
              }`,
            }
          : undefined
      }
    >
      <button
        type="button"
        className={cn(
          "flex h-full min-w-0 flex-1 items-center py-0 pr-0.5 pl-2.5 text-left leading-none",
          dragging ? "cursor-grabbing" : "cursor-grab",
        )}
        onClick={() => onSelect?.(tab.id)}
        title={tab.title}
        aria-current={isActive ? "page" : undefined}
        tabIndex={dragging ? -1 : undefined}
      >
        <span className="truncate">{tab.label}</span>
      </button>
      {closeLabel && onClose ? (
        <Tooltip delayDuration={400}>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={cn(
                "hover:bg-muted mr-1 inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-sm",
                isActive
                  ? "opacity-70"
                  : "opacity-0 group-hover:opacity-70 focus-visible:opacity-70",
              )}
              aria-label={closeLabel}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => onClose(event, tab.id)}
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{closeLabel}</TooltipContent>
        </Tooltip>
      ) : (
        <span className="mr-1 inline-flex size-4 shrink-0" aria-hidden="true" />
      )}
    </div>
  );
}

export interface RepoTabMenuLabels {
  close: string;
  remove: string;
  closeMore: string;
  closeOthers: string;
  closeLeft: string;
  closeRight: string;
  setAlias: string;
  copy: string;
  copyRemote: string;
  copyPath: string;
}

interface SortableRepoTabProps {
  tab: TabDisplayItem;
  isActive: boolean;
  tabIndex: number;
  tabCount: number;
  onSelect: (tabId: string) => void;
  onClose: (event: MouseEvent | KeyboardEvent, tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onCloseOthers: (tabId: string) => void;
  onCloseLeft: (tabId: string) => void;
  onCloseRight: (tabId: string) => void;
  onRemove: (project: Project) => void;
  onSetAlias: (project: Project) => void;
  onCopyRemote: (project: Project) => void;
  onCopyPath: (project: Project) => void;
  closeLabel: string;
  labels: RepoTabMenuLabels;
}

export function SortableRepoTab(props: SortableRepoTabProps) {
  const {
    tab,
    isActive,
    tabIndex,
    tabCount,
    onSelect,
    onClose,
    onCloseTab,
    onCloseOthers,
    onCloseLeft,
    onCloseRight,
    onRemove,
    onSetAlias,
    onCopyRemote,
    onCopyPath,
    closeLabel,
    labels,
  } = props;
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tab.id,
    data: {
      type: "tab",
      workspaceId: tab.workspaceId,
      projectId: tab.project?.id ?? null,
    } satisfies TabDragData,
  });
  const project = tab.project;
  const { menuOpen, onOpenChange } = useContextMenuOpen(() => onSelect(tab.id));
  const revealLabel = revealInFileManagerLabel(detectAppOs(), t);

  async function runSystemOpen(action: () => Promise<void>): Promise<void> {
    try {
      await action();
      toast.success(t("projectManager.manageSystemOpenSuccess"));
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  }

  return (
    <ContextMenu onOpenChange={onOpenChange}>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          className={cn("flex h-7 items-center", isDragging && "opacity-40")}
          style={{ transform: CSS.Transform.toString(transform), transition }}
          {...attributes}
          {...listeners}
        >
          <RepoTabChrome
            tab={tab}
            isActive={isActive || menuOpen}
            onSelect={onSelect}
            onClose={onClose}
            closeLabel={closeLabel}
          />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-40">
        {/* 主操作 → 编辑 → 复制 → 系统打开 → 危险（ui-guidelines §2.3） */}
        <ContextMenuItem onSelect={() => onCloseTab(tab.id)}>
          <X aria-hidden="true" />
          {labels.close}
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger disabled={tabCount <= 1}>{labels.closeMore}</ContextMenuSubTrigger>
          <ContextMenuSubContent className="min-w-40">
            <ContextMenuItem disabled={tabCount <= 1} onSelect={() => onCloseOthers(tab.id)}>
              {labels.closeOthers}
            </ContextMenuItem>
            <ContextMenuItem disabled={tabIndex === 0} onSelect={() => onCloseLeft(tab.id)}>
              {labels.closeLeft}
            </ContextMenuItem>
            <ContextMenuItem
              disabled={tabIndex >= tabCount - 1}
              onSelect={() => onCloseRight(tab.id)}
            >
              {labels.closeRight}
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        {project ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => onSetAlias(project)}>
              <SquarePen aria-hidden="true" />
              {labels.setAlias}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <Copy aria-hidden="true" />
                {labels.copy}
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="min-w-40">
                <ContextMenuItem onSelect={() => onCopyRemote(project)}>
                  <Link aria-hidden="true" />
                  {labels.copyRemote}
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => onCopyPath(project)}>
                  <Copy aria-hidden="true" />
                  {labels.copyPath}
                </ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>
            <ContextMenuSeparator />
            <ContextMenuItem
              onSelect={() =>
                void runSystemOpen(() => systemOpenService.revealInFileManager(project.path))
              }
            >
              <FolderOpen aria-hidden="true" />
              {revealLabel}
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() =>
                void runSystemOpen(() => systemOpenService.openInEditor(project.path))
              }
            >
              <ExternalLink aria-hidden="true" />
              {t("repo.openInEditor")}
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() =>
                void runSystemOpen(() => systemOpenService.openTerminal(project.path))
              }
            >
              <Terminal aria-hidden="true" />
              {t("repo.openInTerminal")}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onSelect={() => onRemove(project)}>
              <Trash2 aria-hidden="true" />
              {labels.remove}
            </ContextMenuItem>
          </>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
}
