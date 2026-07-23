import { useMemo, useState, type FormEvent } from "react";
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
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AtSign,
  MoreHorizontal,
  Pin,
  SquarePen,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { AgentConversation } from "@/types/ai";

interface MultiAgentSidebarProps {
  conversations: readonly AgentConversation[];
  activeConversationId: string | null;
  /** 右侧是否正在展示插件列表 */
  pluginsActive: boolean;
  onSelect: (conversationId: string) => void;
  onCreate: () => void;
  onDelete: (conversationId: string) => void;
  onRename: (conversationId: string, title: string) => void;
  onPin: (conversationId: string, pinned: boolean) => void;
  onReorder: (activeId: string, overId: string) => void;
  /** 打开右侧插件列表 */
  onOpenPlugins: () => void;
}

interface ConversationMenuLabels {
  rename: string;
  pin: string;
  unpin: string;
  delete: string;
  more: string;
}

interface ConversationRowChromeProps {
  conversation: AgentConversation;
  label: string;
  isActive: boolean;
  dragging?: boolean;
  onSelect: (conversationId: string) => void;
}

function ConversationRowChrome({
  conversation,
  label,
  isActive,
  dragging = false,
  onSelect,
}: ConversationRowChromeProps) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 text-left text-xs transition-colors",
        isActive ? "text-foreground" : "text-muted-foreground",
        dragging && "cursor-grabbing",
        !dragging && "cursor-grab",
      )}
      onClick={() => onSelect(conversation.id)}
      title={label}
      aria-pressed={isActive}
      tabIndex={dragging ? -1 : undefined}
    >
      {conversation.pinned ? (
        <Pin className="size-3 shrink-0 fill-current opacity-70" aria-hidden="true" />
      ) : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

interface SortableConversationRowProps {
  conversation: AgentConversation;
  label: string;
  isActive: boolean;
  canDelete: boolean;
  onSelect: (conversationId: string) => void;
  onDelete: (conversationId: string) => void;
  onRename: (conversationId: string) => void;
  onPin: (conversationId: string, pinned: boolean) => void;
  labels: ConversationMenuLabels;
}

function SortableConversationRow({
  conversation,
  label,
  isActive,
  canDelete,
  onSelect,
  onDelete,
  onRename,
  onPin,
  labels,
}: SortableConversationRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: conversation.id });
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          className={cn(
            // min-w-0：否则 flex 子项按内容撑开，标题 truncate 不生效
            "group/row mx-1.5 flex min-w-0 items-center gap-0.5 rounded-md pr-0.5 transition-colors",
            isActive
              ? "bg-muted text-foreground"
              : "hover:bg-accent hover:text-foreground",
            isDragging && "opacity-40",
          )}
          style={{ transform: CSS.Transform.toString(transform), transition }}
          {...attributes}
          {...listeners}
        >
          <ConversationRowChrome
            conversation={conversation}
            label={label}
            isActive={isActive}
            onSelect={onSelect}
          />
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "text-muted-foreground size-6 shrink-0 rounded-md hover:bg-transparent",
                      "opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100",
                      menuOpen && "opacity-100",
                    )}
                    aria-label={labels.more}
                    // 避免拖拽传感器抢走点击
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <MoreHorizontal className="size-3.5" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="right">{labels.more}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent
              align="end"
              className="min-w-36"
              onCloseAutoFocus={(event) => event.preventDefault()}
            >
              <DropdownMenuItem onSelect={() => onRename(conversation.id)}>
                {labels.rename}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => onPin(conversation.id, !conversation.pinned)}
              >
                {conversation.pinned ? labels.unpin : labels.pin}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={!canDelete}
                variant="destructive"
                onSelect={() => onDelete(conversation.id)}
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
                {labels.delete}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-36">
        <ContextMenuItem onSelect={() => onRename(conversation.id)}>
          {labels.rename}
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => onPin(conversation.id, !conversation.pinned)}
        >
          {conversation.pinned ? labels.unpin : labels.pin}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={!canDelete}
          variant="destructive"
          onSelect={() => onDelete(conversation.id)}
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
          {labels.delete}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** 多仓鲸灵左侧会话栏：顶部新建 / 插件入口，下方会话列表 */
export function MultiAgentSidebar({
  conversations,
  activeConversationId,
  pluginsActive,
  onSelect,
  onCreate,
  onDelete,
  onRename,
  onPin,
  onReorder,
  onOpenPlugins,
}: MultiAgentSidebarProps) {
  const { t } = useTranslation();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const labels = useMemo(
    () => ({
      rename: t("multiAgent.tabRename"),
      pin: t("multiAgent.tabPin"),
      unpin: t("multiAgent.tabUnpin"),
      delete: t("multiAgent.deleteConversation"),
      more: t("multiAgent.tabMore"),
    }),
    [t],
  );

  const conversationLabel = (conversation: AgentConversation): string =>
    conversation.title || t("multiAgent.newConversation");

  const draggingConversation = useMemo(
    () => conversations.find((item) => item.id === draggingId) ?? null,
    [conversations, draggingId],
  );

  const renameTarget = useMemo(
    () => conversations.find((item) => item.id === renameTargetId) ?? null,
    [conversations, renameTargetId],
  );

  const pendingDeleteTarget = useMemo(
    () => conversations.find((item) => item.id === pendingDeleteId) ?? null,
    [conversations, pendingDeleteId],
  );

  function openRename(conversationId: string): void {
    const target = conversations.find((item) => item.id === conversationId);
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
      <aside
        className="border-border bg-muted/20 flex w-48 shrink-0 flex-col border-r"
        aria-label={t("multiAgent.sidebarAria")}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="shrink-0 space-y-1.5 p-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-border h-8 w-full justify-start gap-1.5 px-2 text-xs shadow-none"
                  aria-label={t("multiAgent.createConversation")}
                  onClick={onCreate}
                >
                  <SquarePen className="size-3.5" aria-hidden="true" />
                  {t("multiAgent.createConversation")}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {t("multiAgent.createConversation")}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={pluginsActive ? "secondary" : "outline"}
                  size="sm"
                  className="border-border h-8 w-full justify-start gap-1.5 border px-2 text-xs shadow-none"
                  aria-label={t("multiAgent.openPlugins")}
                  aria-pressed={pluginsActive}
                  onClick={onOpenPlugins}
                >
                  <AtSign className="size-3.5" aria-hidden="true" />
                  {t("multiAgent.openPlugins")}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {t("multiAgent.openPluginsHint")}
              </TooltipContent>
            </Tooltip>
          </div>

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
            <ScrollArea className="min-h-0 min-w-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!min-w-0 [&_[data-slot=scroll-area-viewport]>div]:!block">
              <SortableContext
                items={conversations.map((item) => item.id)}
                strategy={verticalListSortingStrategy}
              >
                <div
                  className="flex min-w-0 flex-col gap-0.5 pb-1.5"
                  aria-label={t("multiAgent.conversationsAria")}
                >
                  {conversations.map((conversation) => (
                    <SortableConversationRow
                      key={conversation.id}
                      conversation={conversation}
                      label={conversationLabel(conversation)}
                      isActive={
                        !pluginsActive &&
                        conversation.id === activeConversationId
                      }
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
            </ScrollArea>
            <DragOverlay dropAnimation={null} style={{ zIndex: 100 }}>
              {draggingConversation ? (
                <div className="bg-muted ring-border flex w-44 items-center rounded-md ring-1">
                  <ConversationRowChrome
                    conversation={draggingConversation}
                    label={conversationLabel(draggingConversation)}
                    isActive={
                      draggingConversation.id === activeConversationId
                    }
                    dragging
                    onSelect={() => undefined}
                  />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      </aside>

      <Dialog
        open={renameTargetId != null}
        onOpenChange={(open) => {
          if (!open) {
            setRenameTargetId(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("multiAgent.tabRenameTitle")}</DialogTitle>
          </DialogHeader>
          <form className="grid gap-3" onSubmit={submitRename}>
            <Input
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              placeholder={
                renameTarget
                  ? conversationLabel(renameTarget)
                  : t("multiAgent.newConversation")
              }
              maxLength={48}
              autoFocus
              aria-label={t("multiAgent.tabRename")}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRenameTargetId(null)}
              >
                {t("agent.editCancel")}
              </Button>
              <Button type="submit" disabled={renameValue.trim().length === 0}>
                {t("multiAgent.tabRenameConfirm")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingDeleteId != null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteId(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("multiAgent.deleteConversationTitle")}</DialogTitle>
            <DialogDescription>
              {t("multiAgent.deleteConversationConfirm", {
                name: pendingDeleteTarget
                  ? conversationLabel(pendingDeleteTarget)
                  : t("multiAgent.newConversation"),
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingDeleteId(null)}
            >
              {t("agent.editCancel")}
            </Button>
            <Button type="button" variant="destructive" onClick={confirmDelete}>
              {t("multiAgent.deleteConversation")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
