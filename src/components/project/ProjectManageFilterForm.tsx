import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, RotateCcw, Search } from "lucide-react";

import { SelectMenu } from "@/components/common/SelectMenu";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { useProjectStore } from "@/store/useProjectStore";

import {
  MANAGE_ALL_GROUPS,
  MANAGE_DIRTY_ALL,
  MANAGE_DIRTY_CLEAN,
  MANAGE_DIRTY_DIRTY,
  MANAGE_SYNC_AHEAD,
  MANAGE_SYNC_ALL,
  MANAGE_SYNC_BEHIND,
  MANAGE_SYNC_DIVERGED,
  MANAGE_UNGROUPED,
  type ManageDirtyFilter,
  type ManageFilters,
  type ManageSortBy,
  type ManageSyncFilter,
} from "@/utils/projectManageFilter";

interface ProjectManageFilterFormProps {
  draft: ManageFilters;
  onDraftChange: <K extends keyof ManageFilters>(
    key: K,
    value: ManageFilters[K],
  ) => void;
  onSubmit: () => void;
  onReset: () => void;
  disabled?: boolean;
}

/** 管理台筛选：参考三列网格 + 展开/收起；标签在左、控件在右 */
export function ProjectManageFilterForm({
  draft,
  onDraftChange,
  onSubmit,
  onReset,
  disabled = false,
}: ProjectManageFilterFormProps) {
  const { t } = useTranslation();
  const workspaces = useProjectStore((state) => state.workspaces);
  const [expanded, setExpanded] = useState(false);

  const groupOptions = useMemo(() => {
    const options = [
      {
        value: MANAGE_ALL_GROUPS,
        label: t("projectManager.manageFilterAll"),
      },
      {
        value: MANAGE_UNGROUPED,
        label: t("projectManager.ungrouped"),
      },
      ...workspaces
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((workspace) => ({
          value: workspace.id,
          label: workspace.name,
        })),
    ];
    return options;
  }, [t, workspaces]);

  const dirtyOptions: Array<{ value: ManageDirtyFilter; label: string }> = [
    { value: MANAGE_DIRTY_ALL, label: t("projectManager.manageFilterDirtyAll") },
    {
      value: MANAGE_DIRTY_DIRTY,
      label: t("projectManager.manageFilterDirtyDirty"),
    },
    {
      value: MANAGE_DIRTY_CLEAN,
      label: t("projectManager.manageFilterDirtyClean"),
    },
  ];

  const syncOptions: Array<{ value: ManageSyncFilter; label: string }> = [
    { value: MANAGE_SYNC_ALL, label: t("projectManager.manageFilterSyncAll") },
    {
      value: MANAGE_SYNC_AHEAD,
      label: t("projectManager.manageFilterSyncAhead"),
    },
    {
      value: MANAGE_SYNC_BEHIND,
      label: t("projectManager.manageFilterSyncBehind"),
    },
    {
      value: MANAGE_SYNC_DIVERGED,
      label: t("projectManager.manageFilterSyncDiverged"),
    },
  ];

  const sortOptions: Array<{ value: ManageSortBy; label: string }> = [
    {
      value: "lastOpened",
      label: t("projectManager.manageSortLastOpened"),
    },
    { value: "name", label: t("projectManager.manageSortName") },
    { value: "path", label: t("projectManager.manageSortPath") },
    { value: "createdAt", label: t("projectManager.manageSortCreated") },
  ];

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit();
  }

  const actions = (
    <div className="flex shrink-0 items-center justify-end gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8"
        disabled={disabled}
        onClick={onReset}
      >
        <RotateCcw className="size-3.5" aria-hidden="true" />
        {t("projectManager.manageFilterReset")}
      </Button>
      <Button type="submit" size="sm" className="h-8" disabled={disabled}>
        <Search className="size-3.5" aria-hidden="true" />
        {t("projectManager.manageFilterSubmit")}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-foreground h-8 gap-1 px-2"
        disabled={disabled}
        aria-expanded={expanded}
        onClick={() => setExpanded((prev) => !prev)}
      >
        {expanded
          ? t("projectManager.manageFilterCollapse")
          : t("projectManager.manageFilterExpand")}
        {expanded ? (
          <ChevronUp className="size-3.5" aria-hidden="true" />
        ) : (
          <ChevronDown className="size-3.5" aria-hidden="true" />
        )}
      </Button>
    </div>
  );

  return (
    <form
      className="border-border bg-muted/20 shrink-0 rounded-md border px-3 py-2.5"
      onSubmit={handleSubmit}
    >
      <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
        <FilterField
          label={t("projectManager.manageFilterKeyword")}
          htmlFor="project-manage-filter-keyword"
        >
          <Input
            id="project-manage-filter-keyword"
            value={draft.keyword}
            onChange={(event) => onDraftChange("keyword", event.target.value)}
            placeholder={t("projectManager.manageFilterKeywordPlaceholder")}
            className="h-8 min-w-0 w-full"
            disabled={disabled}
            autoComplete="off"
          />
        </FilterField>

        <FilterField label={t("projectManager.manageFilterGroup")}>
          <SelectMenu
            value={draft.group}
            onChange={(value) => onDraftChange("group", value)}
            ariaLabel={t("projectManager.manageFilterGroup")}
            disabled={disabled}
            size="sm"
            options={groupOptions}
            triggerClassName="h-8 w-full min-w-0"
          />
        </FilterField>

        {expanded ? (
          <>
            <FilterField label={t("projectManager.manageFilterDirty")}>
              <SelectMenu
                value={draft.dirty}
                onChange={(value) =>
                  onDraftChange("dirty", value as ManageDirtyFilter)
                }
                ariaLabel={t("projectManager.manageFilterDirty")}
                disabled={disabled}
                size="sm"
                options={dirtyOptions}
                triggerClassName="h-8 w-full min-w-0"
              />
            </FilterField>

            <FilterField label={t("projectManager.manageFilterSync")}>
              <SelectMenu
                value={draft.sync}
                onChange={(value) =>
                  onDraftChange("sync", value as ManageSyncFilter)
                }
                ariaLabel={t("projectManager.manageFilterSync")}
                disabled={disabled}
                size="sm"
                options={syncOptions}
                triggerClassName="h-8 w-full min-w-0"
              />
            </FilterField>

            <FilterField label={t("projectManager.manageSort")}>
              <SelectMenu
                value={draft.sortBy}
                onChange={(value) =>
                  onDraftChange("sortBy", value as ManageSortBy)
                }
                ariaLabel={t("projectManager.manageSort")}
                disabled={disabled}
                size="sm"
                options={sortOptions}
                triggerClassName="h-8 w-full min-w-0"
              />
            </FilterField>

            <div className="flex items-center justify-end sm:col-span-2 xl:col-span-1">
              {actions}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-end sm:col-span-2 xl:col-span-1">
            {actions}
          </div>
        )}
      </div>
    </form>
  );
}

function FilterField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <Field
      orientation="horizontal"
      // 覆盖官方 horizontal 的 label flex-auto，避免标题被撑开留下大块空白
      className="w-full min-w-0 gap-2 [&>[data-slot=field-label]]:flex-none"
    >
      <FieldLabel
        htmlFor={htmlFor}
        className="text-muted-foreground w-14 shrink-0 text-xs"
      >
        {label}
      </FieldLabel>
      <div className="min-w-0 flex-1">{children}</div>
    </Field>
  );
}
