import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { Folder } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { TreeSelect } from "@/components/common/TreeSelect";
import { ButtonLoadingContent } from "@/components/common/ButtonLoadingContent";
import { LucideIconPicker } from "@/components/common/LucideIconPicker";
import { AppDialogContent } from "@/components/common/AppDialogContent";
import { lucideIconPickerI18n } from "@/components/project/lucideIconPickerI18n";
import {
  mapWorkspaceTreeToSelectNodes,
  WorkspaceGroupLabel,
} from "@/components/project/WorkspaceGroupLeading";
import { DEFAULT_WORKSPACE_ICON } from "@/components/project/workspaceGroupAppearance";
import { SettingsColorSwatch } from "@/components/settings/SettingsColorSwatch";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useProjectStore } from "@/store/useProjectStore";
import { toUserMessage } from "@/types/error";
import type { Workspace, WorkspaceColor, WorkspaceIcon } from "@/types/project";
import {
  buildWorkspaceTree,
  collectWorkspaceSubtreeIds,
  findWorkspaceTreeNode,
} from "@/utils/workspaceOptions";
import {
  DEFAULT_WORKSPACE_COLOR,
  normalizeWorkspaceColor,
  WORKSPACE_COLOR_PRESETS,
} from "@/utils/workspaceColor";

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
  WorkspaceGroupDialogCreateProps | WorkspaceGroupDialogEditProps;

/** 新建 / 编辑仓库分组：名称、上级、图标、颜色 */
export function WorkspaceGroupDialog(props: WorkspaceGroupDialogProps) {
  const { open, onOpenChange, mode } = props;
  const { t } = useTranslation();
  const workspaces = useProjectStore((state) => state.workspaces);
  const createWorkspace = useProjectStore((state) => state.createWorkspace);
  const updateWorkspace = useProjectStore((state) => state.updateWorkspace);

  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [icon, setIcon] = useState<WorkspaceIcon>(DEFAULT_WORKSPACE_ICON);
  const [color, setColor] = useState<WorkspaceColor>(DEFAULT_WORKSPACE_COLOR);
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

  const parentWorkspaceTree = useMemo(
    () => buildWorkspaceTree(workspaces, parentExcludeIds),
    [parentExcludeIds, workspaces],
  );

  const parentTree = useMemo(
    () => mapWorkspaceTreeToSelectNodes(parentWorkspaceTree),
    [parentWorkspaceTree],
  );

  const parentNode = useMemo(
    () => (parentId ? findWorkspaceTreeNode(parentWorkspaceTree, parentId) : null),
    [parentId, parentWorkspaceTree],
  );

  const parentLabel = parentNode?.label ?? (parentId ? parentId : t("projectManager.rootGroup"));
  const rootLeading = <Folder className="size-4 shrink-0" aria-hidden="true" />;

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
      setColor(normalizeWorkspaceColor(editWorkspace.color));
      return;
    }
    setName("");
    setParentId(createParentId ?? "");
    setIcon(DEFAULT_WORKSPACE_ICON);
    setColor(DEFAULT_WORKSPACE_COLOR);
  }, [open, mode, editWorkspace, createParentId]);

  const parentName = parentId ? workspaces.find((item) => item.id === parentId)?.name : null;

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
          // 锁定分组禁止调整父级；提交时也不带 parentId，避免后端拒绝
          ...(props.workspace.locked ? {} : { parentId: parentId || null }),
          icon,
          color,
        });
        toast.success(t("projectManager.editGroupSuccess"));
        props.onUpdated?.(workspace);
      } else {
        const workspace = await createWorkspace(nextName, parentId || undefined, icon, color);
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
      <AppDialogContent size="sm">
        <DialogHeader>
          <DialogTitle>
            {mode === "edit" ? t("projectManager.editGroup") : t("projectManager.createGroup")}
          </DialogTitle>
          <DialogDescription>
            {mode === "edit"
              ? t("projectManager.editGroupDescription")
              : parentName
                ? t("projectManager.createChildGroup", { name: parentName })
                : t("projectManager.groupName")}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
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
                disabled={saving || Boolean(editWorkspace?.locked)}
                emptyOption={{
                  value: "",
                  label: t("projectManager.rootGroup"),
                  icon: rootLeading,
                }}
                displayLabel={
                  parentNode ? (
                    <WorkspaceGroupLabel
                      name={parentNode.label}
                      icon={parentNode.icon}
                      color={parentNode.color}
                    />
                  ) : (
                    <span className="flex min-w-0 flex-1 items-center gap-2 text-left">
                      {rootLeading}
                      <span className="min-w-0 flex-1 truncate">{parentLabel}</span>
                    </span>
                  )
                }
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel>{t("projectManager.groupIcon")}</FieldLabel>
                <LucideIconPicker
                  value={icon}
                  onValueChange={setIcon}
                  disabled={saving}
                  {...lucideIconPickerI18n(t, { ariaLabel: t("projectManager.groupIcon") })}
                />
              </Field>
              <Field>
                <FieldLabel>{t("projectManager.groupColor")}</FieldLabel>
                <SettingsColorSwatch
                  value={color}
                  ariaLabel={t("projectManager.groupColor")}
                  presetValue={DEFAULT_WORKSPACE_COLOR}
                  solid
                  showPresets={false}
                  suggestions={WORKSPACE_COLOR_PRESETS}
                  suggestionsLabel={t("projectManager.groupColorPresets")}
                  size="default"
                  className="w-full max-w-none"
                  disabled={saving}
                  onChange={(next) => setColor(normalizeWorkspaceColor(next))}
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
              <ButtonLoadingContent loading={saving} loadingLabel={t("common.loading")}>
                {mode === "edit" ? t("projectManager.saveGroup") : t("projectManager.createGroup")}
              </ButtonLoadingContent>
            </Button>
          </DialogFooter>
        </form>
      </AppDialogContent>
    </Dialog>
  );
}
