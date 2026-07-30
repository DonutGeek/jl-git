import { useMemo, useState, type FormEvent, type KeyboardEvent, type MouseEvent } from "react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { horizontalListSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AtSign, Pin, PinOff, SquarePen, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { AppDialogContent } from "@/components/common/AppDialogContent";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { AgentConversation } from "@/types/ai";
import { useContextMenuOpen } from "@/utils/contextMenuHighlight";

interface AgentConversationTabsProps {
  conversations: readonly AgentConversation[];
  activeConversationId: string | undefined;
  onSelect: (conversationId: string) => void;
  onCreate: () => void;
  onDelete: (conversationId: string) => void;
  onRename: (conversationId: string, title: string) => void;
  onPin: (conversationId: string, pinned: boolean) => void;
  onReorder: (activeId: string, overId: string) => void;
  /** 打开插件列表（单仓顶栏入口） */
  onOpenPlugins?: () => void;
}

interface ConversationTabChromeProps {
  conversation: AgentConversation;
  label: string;
  isActive: boolean;
  dragging?: boolean;
  canDelete: boolean;
  onSelect: (conversationId: string) => void;
  onDelete: (conversationId: string) => void;
  deleteLabel: string;
}

function ConversationTabChrome({
  conversation,
  label,
  isActive,
  dragging = false,
  canDelete,
  onSelect,
  onDelete,
  deleteLabel,
}: ConversationTabChromeProps) {
  return (
    <div
      className={cn(
        "group relative flex h-7 min-w-14 max-w-32 items-center rounded-md text-xs leading-none transition-colors",
        isActive
          ? "bg-accent text-foreground"
          : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
        dragging && "bg-accent text-foreground",
      )}
    >
      <button
        type="button"
        className={cn(
          "flex h-full min-w-0 flex-1 items-center gap-1 truncate py-0 pr-0.5 pl-2 text-left leading-none",
          dragging ? "cursor-grabbing" : "cursor-grab",
        )}
        onClick={() => onSelect(conversation.id)}
        title={label}
        aria-pressed={isActive}
        tabIndex={dragging ? -1 : undefined}
      >
        {conversation.pinned ? (
          <Pin className="size-3 shrink-0 fill-current opacity-70" aria-hidden="true" />
        ) : null}
        <span className="truncate">{label}</span>
      </button>
      <Tooltip delayDuration={400}>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn(
              "mr-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-sm",
              canDelete
                ? "hover:bg-muted-foreground/15 cursor-pointer"
                : "cursor-not-allowed opacity-35",
              isActive || dragging
                ? "opacity-70"
                : "opacity-0 group-hover:opacity-70 focus-visible:opacity-70",
            )}
            aria-label={deleteLabel}
            disabled={!canDelete}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event: MouseEvent | KeyboardEvent) => {
              event.stopPropagation();
              if (canDelete) {
                onDelete(conversation.id);
              }
            }}
          >
            <X className="size-3" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{deleteLabel}</TooltipContent>
      </Tooltip>
    </div>
  );
}

interface SortableConversationTabProps {
  conversation: AgentConversation;
  label: string;
  isActive: boolean;
  canDelete: boolean;
  onSelect: (conversationId: string) => void;
  onDelete: (conversationId: string) => void;
  onRename: (conversationId: string) => void;
  onPin: (conversationId: string, pinned: boolean) => void;
  labels: {
    rename: string;
    pin: string;
    unpin: string;
    delete: string;
  };
}

function SortableConversationTab({
  conversation,
  label,
  isActive,
  canDelete,
  onSelect,
  onDelete,
  onRename,
  onPin,
  labels,
}: SortableConversationTabProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: conversation.id,
  });
  const { menuOpen, onOpenChange } = useContextMenuOpen(() => onSelect(conversation.id));

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
          <ConversationTabChrome
            conversation={conversation}
            label={label}
            isActive={isActive || menuOpen}
            canDelete={canDelete}
            onSelect={onSelect}
            onDelete={onDelete}
            deleteLabel={labels.delete}
          />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-36">
        {/* 编辑 → 危险（与多仓侧栏同构，ui-guidelines §2.3） */}
        <ContextMenuItem onSelect={() => onRename(conversation.id)}>
          <SquarePen aria-hidden="true" />
          {labels.rename}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onPin(conversation.id, !conversation.pinned)}>
          {conversation.pinned ? <PinOff aria-hidden="true" /> : <Pin aria-hidden="true" />}
          {conversation.pinned ? labels.unpin : labels.pin}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={!canDelete}
          variant="destructive"
          onSelect={() => onDelete(conversation.id)}
        >
          <Trash2 aria-hidden="true" />
          {labels.delete}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** 会话 Tab 栏：拖拽排序 / 右键重命名·置顶·删除 / 新建 */
export function AgentConversationTabs({
  conversations,
  activeConversationId,
  onSelect,
  onCreate,
  onDelete,
  onRename,
  onPin,
  onReorder,
  onOpenPlugins,
}: AgentConversationTabsProps) {
  const { t } = useTranslation();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const labels = useMemo(
    () => ({
      rename: t("agent.tabRename"),
      pin: t("agent.tabPin"),
      unpin: t("agent.tabUnpin"),
      delete: t("agent.deleteConversation"),
    }),
    [t],
  );

  const conversationLabel = (conversation: AgentConversation): string =>
    conversation.title || t("agent.newConversation");

  const draggingConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === draggingId) ?? null,
    [conversations, draggingId],
  );

  const pendingDeleteTarget = useMemo(
    () => conversations.find((conversation) => conversation.id === pendingDeleteId) ?? null,
    [conversations, pendingDeleteId],
  );

  function openRename(conversationId: string): void {
    const target = conversations.find((conversation) => conversation.id === conversationId);
    if (!target) {
      return;
    }
    setRenameTargetId(conversationId);
    setRenameValue(target.title || "");
  }

  function submitRename(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!renameTargetId) {
      return;
    }
    const next = renameValue.trim();
    if (!next) {
      return;
    }
    onRename(renameTargetId, next);
    setRenameTargetId(null);
  }

  function requestDelete(conversationId: string): void {
    setPendingDeleteId(conversationId);
  }

  function confirmDelete(): void {
    if (!pendingDeleteId) {
      return;
    }
    onDelete(pendingDeleteId);
    setPendingDeleteId(null);
  }

  const canDelete = conversations.length > 1;

  return (
    <>
      <header className="relative flex h-10 shrink-0 items-center gap-1 px-3">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={(event: DragStartEvent) => {
            setDraggingId(String(event.active.id));
          }}
          onDragEnd={(event: DragEndEvent) => {
            setDraggingId(null);
            if (event.over) {
              onReorder(String(event.active.id), String(event.over.id));
            }
          }}
          onDragCancel={() => setDraggingId(null)}
        >
          <ScrollArea className="h-10 min-w-0 flex-1">
            <SortableContext
              items={conversations.map((conversation) => conversation.id)}
              strategy={horizontalListSortingStrategy}
            >
              <div className="flex h-10 w-max items-center gap-1 pr-1">
                {conversations.map((conversation) => (
                  <SortableConversationTab
                    key={conversation.id}
                    conversation={conversation}
                    label={conversationLabel(conversation)}
                    isActive={conversation.id === activeConversationId}
                    canDelete={canDelete}
                    onSelect={onSelect}
                    onDelete={requestDelete}
                    onRename={openRename}
                    onPin={onPin}
                    labels={labels}
                  />
                ))}
              </div>
            </SortableContext>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
          <DragOverlay dropAnimation={null} style={{ zIndex: 100 }}>
            {draggingConversation ? (
              <ConversationTabChrome
                conversation={draggingConversation}
                label={conversationLabel(draggingConversation)}
                isActive={draggingConversation.id === activeConversationId}
                dragging
                canDelete={canDelete}
                onSelect={() => undefined}
                onDelete={() => undefined}
                deleteLabel={labels.delete}
              />
            ) : null}
          </DragOverlay>
        </DndContext>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground size-7 shrink-0"
              aria-label={t("agent.createConversation")}
              onClick={onCreate}
            >
              <SquarePen aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("agent.createConversation")}</TooltipContent>
        </Tooltip>
        {onOpenPlugins ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground size-7 shrink-0"
                aria-label={t("agent.openPlugins")}
                onClick={onOpenPlugins}
              >
                <AtSign aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("agent.openPluginsHint")}</TooltipContent>
          </Tooltip>
        ) : null}
      </header>

      <Dialog
        open={renameTargetId != null}
        onOpenChange={(open) => {
          if (!open) {
            setRenameTargetId(null);
          }
        }}
      >
        <AppDialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{t("agent.tabRenameTitle")}</DialogTitle>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={submitRename}>
            <Field>
              <FieldLabel className="sr-only" htmlFor="agent-conversation-rename">
                {t("agent.tabRename")}
              </FieldLabel>
              <Input
                id="agent-conversation-rename"
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                placeholder={t("agent.tabRenamePlaceholder")}
                maxLength={48}
                autoFocus
              />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenameTargetId(null)}>
                {t("agent.editCancel")}
              </Button>
              <Button type="submit" disabled={renameValue.trim().length === 0}>
                {t("agent.tabRenameConfirm")}
              </Button>
            </DialogFooter>
          </form>
        </AppDialogContent>
      </Dialog>

      <Dialog
        open={pendingDeleteId != null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteId(null);
          }
        }}
      >
        <AppDialogContent>
          <DialogHeader>
            <DialogTitle>{t("agent.deleteConversationTitle")}</DialogTitle>
            <DialogDescription>
              {t("agent.deleteConversationConfirm", {
                name: pendingDeleteTarget
                  ? conversationLabel(pendingDeleteTarget)
                  : t("agent.newConversation"),
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingDeleteId(null)}>
              {t("agent.editCancel")}
            </Button>
            <Button type="button" variant="destructive" onClick={confirmDelete}>
              {t("agent.deleteConversation")}
            </Button>
          </DialogFooter>
        </AppDialogContent>
      </Dialog>
    </>
  );
}
