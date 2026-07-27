import { FormEvent, useEffect, useMemo, useState } from "react";
import { Folder } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { SelectMenu } from "@/components/common/SelectMenu";
import { TreeSelect } from "@/components/common/TreeSelect";
import {
  WORKSPACE_COLOR_CLASS,
  WORKSPACE_COLOR_OPTIONS,
  WORKSPACE_ICON_OPTIONS,
  workspaceIconComponent,
} from "@/components/project/workspaceGroupAppearance";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/store/useProjectStore";
import { toUserMessage } from "@/types/error";
import type {
  Workspace,
  WorkspaceColor,
  WorkspaceIcon,
} from "@/types/project";
import {
  buildWorkspaceTree,
  collectWorkspaceSubtreeIds,
  findWorkspaceTreeLabel,
} from "@/utils/workspaceOptions";

interface WorkspaceGroupDialogCreateProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create";
  /** 新建时默认上级分组 */
  initialParentId?: string | null;
  onCreated?: (workspace: Workspace) => void;
}

interface WorkspaceGroupDialogEditProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "edit";
  workspace: Workspace;
  onUpdated?: (workspace: Workspace) => void;
}

export type WorkspaceGroupDialogProps =
  | WorkspaceGroupDialogCreateProps
  | WorkspaceGroupDialogEditProps;

/** 新建 / 编辑仓库分组：名称、上级、图标、颜色 */
export function WorkspaceGroupDialog(props: WorkspaceGroupDialogProps) {
  const { open, onOpenChange, mode } = props;
  const { t } = useTranslation();
  const workspaces = useProjectStore((state) => state.workspaces);
  const createWorkspace = useProjectStore((state) => state.createWorkspace);
  const updateWorkspace = useProjectStore((state) => state.updateWorkspace);

  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [icon, setIcon] = useState<WorkspaceIcon>("code");
  const [color, setColor] = useState<WorkspaceColor>("blue");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editWorkspace = mode === "edit" ? props.workspace : null;
  const createParentId = mode === "create" ? (props.initialParentId ?? null) : null;

  const parentExcludeIds = useMemo(() => {
    if (!editWorkspace) {
      return new Set<string>();
    }
    return collectWorkspaceSubtreeIds(workspaces, editWorkspace.id);
  }, [editWorkspace, workspaces]);

  const parentTree = useMemo(
    () => buildWorkspaceTree(workspaces, parentExcludeIds),
    [parentExcludeIds, workspaces],
  );

  const parentLabel = useMemo(() => {
    if (!parentId) {
      return t("projectManager.rootGroup");
    }
    return findWorkspaceTreeLabel(parentTree, parentId) ?? parentId;
  }, [parentId, parentTree, t]);

  const folderIcon = (
    <Folder className="size-4 shrink-0" aria-hidden="true" />
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    setError(null);
    setSaving(false);
    if (mode === "edit" && editWorkspace) {
      setName(editWorkspace.name);
      setParentId(editWorkspace.parentId ?? "");
      setIcon(editWorkspace.icon);
      setColor(editWorkspace.color);
      return;
    }
    setName("");
    setParentId(createParentId ?? "");
    setIcon("code");
    setColor("blue");
  }, [open, mode, editWorkspace, createParentId]);

  const Icon = workspaceIconComponent(icon);
  const parentName = parentId
    ? workspaces.find((item) => item.id === parentId)?.name
    : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    // Portal 内表单的 submit 会沿 React 树冒泡到外层「打开/克隆」等 form，必须阻断
    event.preventDefault();
    event.stopPropagation();
    const nextName = name.trim();
    if (!nextName || saving) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (mode === "edit") {
        const workspace = await updateWorkspace({
          id: props.workspace.id,
          name: nextName,
          parentId: parentId || null,
          icon,
          color,
        });
        toast.success(t("projectManager.editGroupSuccess"));
        props.onUpdated?.(workspace);
      } else {
        const workspace = await createWorkspace(
          nextName,
          parentId || undefined,
          icon,
          color,
        );
        toast.success(t("projectManager.createGroupSuccess"));
        props.onCreated?.(workspace);
      }
      onOpenChange(false);
    } catch (submitError) {
      const message = toUserMessage(submitError);
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  function handleOpenChange(nextOpen: boolean): void {
    if (!nextOpen && saving) {
      return;
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {mode === "edit"
              ? t("projectManager.editGroup")
              : t("projectManager.createGroup")}
          </DialogTitle>
          <DialogDescription>
            {mode === "edit"
              ? t("projectManager.editGroupDescription")
              : parentName
                ? t("projectManager.createChildGroup", { name: parentName })
                : t("projectManager.groupName")}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-6" onSubmit={(event) => void handleSubmit(event)}>
          <FieldGroup className="gap-4">
            <Field data-invalid={error ? true : undefined}>
              <FieldLabel htmlFor="workspace-group-dialog-name">
                {t("projectManager.groupName")}
              </FieldLabel>
              <Input
                id="workspace-group-dialog-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("projectManager.groupNamePlaceholder")}
                autoFocus
                disabled={saving}
              />
            </Field>

            <Field>
              <FieldLabel>{t("projectManager.parentGroup")}</FieldLabel>
              <TreeSelect
                value={parentId}
                onChange={setParentId}
                nodes={parentTree}
                ariaLabel={t("projectManager.parentGroup")}
                disabled={saving}
                triggerIcon={folderIcon}
                nodeIcon={folderIcon}
                emptyOption={{
                  value: "",
                  label: t("projectManager.rootGroup"),
                  icon: folderIcon,
                }}
                displayLabel={
                  <span className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    {folderIcon}
                    <span className="min-w-0 flex-1 truncate">{parentLabel}</span>
                  </span>
                }
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel>{t("projectManager.groupIcon")}</FieldLabel>
                <SelectMenu
                  value={icon}
                  disabled={saving}
                  displayLabel={
                    <span className="flex items-center gap-2">
                      <Icon className="size-4" aria-hidden="true" />
                      {t(
                        `projectManager.icon${icon[0].toUpperCase()}${icon.slice(1)}`,
                      )}
                    </span>
                  }
                  options={WORKSPACE_ICON_OPTIONS.map((option) => ({
                    value: option.value,
                    label: t(option.labelKey),
                    preview: <option.Icon className="size-4" />,
                  }))}
                  onChange={(next) => setIcon(next as WorkspaceIcon)}
                  ariaLabel={t("projectManager.groupIcon")}
                />
              </Field>
              <Field>
                <FieldLabel>{t("projectManager.groupColor")}</FieldLabel>
                <SelectMenu
                  value={color}
                  disabled={saving}
                  displayLabel={
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          "block size-3 rounded-full",
                          WORKSPACE_COLOR_CLASS[color],
                        )}
                      />
                      {t(
                        `projectManager.color${color[0].toUpperCase()}${color.slice(1)}`,
                      )}
                    </span>
                  }
                  options={WORKSPACE_COLOR_OPTIONS.map((option) => ({
                    value: option.value,
                    label: t(option.labelKey),
                    preview: (
                      <span
                        className={cn(
                          "block size-3 rounded-full",
                          WORKSPACE_COLOR_CLASS[option.value],
                        )}
                      />
                    ),
                  }))}
                  onChange={(next) => setColor(next as WorkspaceColor)}
                  ariaLabel={t("projectManager.groupColor")}
                />
              </Field>
            </div>

            {error ? (
              <Field data-invalid>
                <FieldError>{error}</FieldError>
              </Field>
            ) : null}
          </FieldGroup>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => handleOpenChange(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={!name.trim() || saving}>
              {saving
                ? t("common.loading")
                : mode === "edit"
                  ? t("projectManager.saveGroup")
                  : t("projectManager.createGroup")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
