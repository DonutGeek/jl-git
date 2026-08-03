import { useState, type ReactElement } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Lock, LockOpen, Palette, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { AppAlertDialogContent, AppDialogContent } from "@/components/common/AppDialogContent";
import { SettingsColorSwatch } from "@/components/settings/SettingsColorSwatch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { useProjectStore } from "@/store/useProjectStore";
import { toUserMessage } from "@/types/error";
import type { Workspace, WorkspaceColor } from "@/types/project";
import {
  DEFAULT_WORKSPACE_COLOR,
  normalizeWorkspaceColor,
  WORKSPACE_COLOR_PRESETS,
} from "@/utils/workspaceColor";
import { useContextMenuOpen } from "@/utils/contextMenuHighlight";
import { deferUi } from "@/utils/deferUi";

interface WorkspaceGroupContextMenuProps {
  workspace: Workspace;
  onCloseGroup: (workspaceId: string) => void;
  children: ReactElement;
}

/** 标签栏分组名称右键：换色、关闭、锁定、删除。 */
export function WorkspaceGroupContextMenu({
  workspace,
  onCloseGroup,
  children,
}: WorkspaceGroupContextMenuProps) {
  const { t } = useTranslation();
  const updateWorkspace = useProjectStore((state) => state.updateWorkspace);
  const removeWorkspace = useProjectStore((state) => state.removeWorkspace);
  const { onOpenChange } = useContextMenuOpen();
  const [colorOpen, setColorOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draftColor, setDraftColor] = useState<WorkspaceColor>(() =>
    normalizeWorkspaceColor(workspace.color),
  );

  async function handleToggleLock(): Promise<void> {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      await updateWorkspace({ id: workspace.id, locked: !workspace.locked });
      toast.success(
        workspace.locked
          ? t("projectManager.unlockGroupSuccess", { name: workspace.name })
          : t("projectManager.lockGroupSuccess", { name: workspace.name }),
      );
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveColor(): Promise<void> {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      await updateWorkspace({ id: workspace.id, color: draftColor });
      setColorOpen(false);
      toast.success(t("projectManager.changeGroupColorSuccess", { name: workspace.name }));
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (busy || workspace.locked) {
      return;
    }
    setBusy(true);
    try {
      await removeWorkspace(workspace.id);
      setDeleteOpen(false);
      toast.success(t("projectManager.deleteGroupSuccess", { name: workspace.name }));
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ContextMenu onOpenChange={onOpenChange}>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          <ContextMenuItem
            disabled={busy}
            onSelect={() => {
              deferUi(() => {
                setDraftColor(normalizeWorkspaceColor(workspace.color));
                setColorOpen(true);
              });
            }}
          >
            <Palette aria-hidden="true" />
            {t("projectManager.changeGroupColor")}
          </ContextMenuItem>
          <ContextMenuItem
            disabled={busy}
            onSelect={() => {
              deferUi(() => onCloseGroup(workspace.id));
            }}
          >
            <X aria-hidden="true" />
            {t("projectManager.closeGroup")}
          </ContextMenuItem>
          <ContextMenuItem disabled={busy} onSelect={() => void handleToggleLock()}>
            {workspace.locked ? <LockOpen aria-hidden="true" /> : <Lock aria-hidden="true" />}
            {workspace.locked ? t("projectManager.unlockGroup") : t("projectManager.lockGroup")}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="destructive"
            disabled={busy || workspace.locked}
            onSelect={() => {
              if (workspace.locked) {
                return;
              }
              deferUi(() => setDeleteOpen(true));
            }}
          >
            <Trash2 aria-hidden="true" />
            {t("projectManager.deleteGroup")}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <Dialog open={colorOpen} onOpenChange={setColorOpen}>
        <AppDialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("projectManager.changeGroupColorTitle")}</DialogTitle>
            <DialogDescription>
              {t("projectManager.changeGroupColorDescription", { name: workspace.name })}
            </DialogDescription>
          </DialogHeader>
          <Field className="gap-1.5">
            <FieldLabel>{t("projectManager.groupColor")}</FieldLabel>
            <SettingsColorSwatch
              value={draftColor}
              onChange={(hex) => setDraftColor(normalizeWorkspaceColor(hex))}
              ariaLabel={t("projectManager.groupColor")}
              presetValue={DEFAULT_WORKSPACE_COLOR}
              solid
              showPresets={false}
              suggestions={WORKSPACE_COLOR_PRESETS}
              suggestionsLabel={t("projectManager.groupColorPresets")}
              className="w-full max-w-none"
              disabled={busy}
            />
          </Field>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setColorOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="button" disabled={busy} onClick={() => void handleSaveColor()}>
              {t("projectManager.saveGroup")}
            </Button>
          </DialogFooter>
        </AppDialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AppAlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("projectManager.deleteGroupTitle")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-muted-foreground text-sm">
                <p className="text-foreground">
                  <Trans
                    i18nKey="projectManager.deleteGroupQuestion"
                    values={{ name: workspace.name }}
                    components={{
                      name: <span className="font-medium" />,
                    }}
                  />
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
            >
              {t("projectManager.deleteGroupAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AppAlertDialogContent>
      </AlertDialog>
    </>
  );
}
