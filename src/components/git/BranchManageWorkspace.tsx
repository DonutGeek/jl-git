import { useCallback, useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import dayjs from "dayjs";
import { GitBranch as GitBranchIcon, RefreshCw, Search, TriangleAlert } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import {
  BranchManageTable,
  type BranchManageSortDirection,
} from "@/components/git/BranchManageTable";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { deleteBranch, listBranches } from "@/services/git/git.branch";
import { toUserMessage } from "@/types/error";
import type { GitBranch } from "@/types/git";
import type { Project } from "@/types/project";
import { isBranchActive } from "@/utils/branchActivity";
import { deferUi } from "@/utils/deferUi";

type ScopeFilter = "local" | "remote";
type ActivityFilter = "all" | "active" | "inactive";

interface BranchManageWorkspaceProps {
  project: Project;
}

function SegmentedControl<T extends string>({
  value,
  options,
  ariaLabel,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  ariaLabel: string;
  onChange: (value: T) => void;
}) {
  return (
    <div
      className="bg-muted/60 flex flex-wrap gap-0.5 rounded-md p-0.5"
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            className={cn(
              "hover:bg-background/80 min-w-0 cursor-pointer rounded px-2 py-1 text-[11px] transition-colors",
              selected
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground",
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** 分支管理子弹窗：只读列表 + 筛选/排序 */
export function BranchManageWorkspace({ project }: BranchManageWorkspaceProps) {
  const { t } = useTranslation();
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<ScopeFilter>("local");
  const [activity, setActivity] = useState<ActivityFilter>("all");
  const [search, setSearch] = useState("");
  const [sortDir, setSortDir] = useState<BranchManageSortDirection>("desc");
  const [deleteTarget, setDeleteTarget] = useState<GitBranch | null>(null);
  const [deleteRemoteAlso, setDeleteRemoteAlso] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deletingName, setDeletingName] = useState<string | null>(null);

  const loadBranches = useCallback(async () => {
    const result = await listBranches(project.path, true);
    setBranches(result);
    return result;
  }, [project.path]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void loadBranches()
      .catch((reason: unknown) => {
        if (active) {
          setError(toUserMessage(reason) || t("branchManage.loadFailed"));
          setBranches([]);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadBranches, t]);

  const scopedBranches = useMemo(
    () =>
      branches.filter((branch) =>
        scope === "local" ? !branch.isRemote : branch.isRemote,
      ),
    [branches, scope],
  );

  const activityCounts = useMemo(() => {
    let activeCount = 0;
    let inactiveCount = 0;
    for (const branch of scopedBranches) {
      if (isBranchActive(branch.tipAuthoredAt)) {
        activeCount += 1;
      } else {
        inactiveCount += 1;
      }
    }
    return {
      all: scopedBranches.length,
      active: activeCount,
      inactive: inactiveCount,
    };
  }, [scopedBranches]);

  const searchLower = search.trim().toLowerCase();

  const visibleBranches = useMemo(() => {
    let next = scopedBranches;
    if (activity === "active") {
      next = next.filter((branch) => isBranchActive(branch.tipAuthoredAt));
    } else if (activity === "inactive") {
      next = next.filter((branch) => !isBranchActive(branch.tipAuthoredAt));
    }
    if (searchLower) {
      next = next.filter((branch) => {
        const haystack =
          `${branch.name} ${branch.upstream ?? ""} ${branch.tipShortId} ${branch.tipAuthorName}`.toLowerCase();
        return haystack.includes(searchLower);
      });
    }
    return [...next].sort((left, right) => compareByTime(left, right, sortDir));
  }, [activity, scopedBranches, searchLower, sortDir]);

  async function handleRefresh(): Promise<void> {
    setRefreshing(true);
    try {
      await loadBranches();
      toast.success(t("branchManage.refreshSuccess"));
    } catch (reason: unknown) {
      toast.error(toUserMessage(reason) || t("branchManage.refreshFailed"));
    } finally {
      setRefreshing(false);
    }
  }

  const deleteHasRemote = useMemo(() => {
    if (!deleteTarget || deleteTarget.isRemote) {
      return false;
    }
    const remoteName = `origin/${deleteTarget.name}`;
    return branches.some((branch) => branch.isRemote && branch.name === remoteName);
  }, [branches, deleteTarget]);

  function openDelete(branch: GitBranch): void {
    if (branch.isRemote || branch.isCurrent) {
      return;
    }
    deferUi(() => {
      setDeleteTarget(branch);
      setDeleteRemoteAlso(false);
      setDeleteBusy(false);
    });
  }

  async function confirmDelete(): Promise<void> {
    if (!deleteTarget || deleteBusy) {
      return;
    }
    const targetName = deleteTarget.name;
    const alsoRemote = deleteHasRemote && deleteRemoteAlso;

    flushSync(() => {
      setDeleteTarget(null);
      setDeleteRemoteAlso(false);
    });

    setDeleteBusy(true);
    setDeletingName(targetName);
    try {
      await deleteBranch(project.path, targetName, {
        force: true,
        deleteRemote: alsoRemote,
        remote: "origin",
      });
      await loadBranches();
      toast.success(t("repo.deleteBranchSuccess", { name: targetName }));
    } catch (reason: unknown) {
      toast.error(toUserMessage(reason) || t("branchManage.deleteFailed"));
    } finally {
      setDeleteBusy(false);
      setDeletingName(null);
    }
  }

  return (
    <main className="bg-background text-foreground flex h-screen min-h-0 w-full flex-col overflow-hidden">
      <header
        data-tauri-drag-region
        className="border-border bg-muted/40 flex h-11 shrink-0 items-center border-b px-4 pl-[88px]"
      >
        <span className="truncate text-sm font-semibold">{t("branchManage.windowTitle")}</span>
      </header>

      <div className="border-border flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
        <SegmentedControl
          value={scope}
          ariaLabel={t("branchManage.scopeLocal")}
          options={[
            { value: "local", label: t("branchManage.scopeLocal") },
            { value: "remote", label: t("branchManage.scopeRemote") },
          ]}
          onChange={setScope}
        />

        <SegmentedControl
          value={activity}
          ariaLabel={t("branchManage.filterAll")}
          options={[
            {
              value: "all",
              label: `${t("branchManage.filterAll")} (${activityCounts.all})`,
            },
            {
              value: "active",
              label: `${t("branchManage.filterActive")} (${activityCounts.active})`,
            },
            {
              value: "inactive",
              label: `${t("branchManage.filterInactive")} (${activityCounts.inactive})`,
            },
          ]}
          onChange={setActivity}
        />

        <div className="ml-auto flex items-center gap-1.5">
          <div className="relative">
            <Search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("branchManage.searchPlaceholder")}
              className="h-7 w-52 pl-7 text-xs shadow-none"
              aria-label={t("branchManage.searchPlaceholder")}
            />
          </div>

          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-7 shrink-0 [&_svg]:size-3.5"
            aria-label={t("repo.refresh")}
            disabled={loading || refreshing}
            onClick={() => void handleRefresh()}
          >
            {refreshing ? (
              <Spinner className="size-3.5" />
            ) : (
              <RefreshCw aria-hidden="true" />
            )}
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground flex flex-1 items-center justify-center gap-2 text-sm">
          <Spinner className="size-4" />
          {t("branchManage.loading")}
        </p>
      ) : null}
      {error ? (
        <p className="text-destructive flex flex-1 items-center justify-center px-4 text-center text-sm">
          {error}
        </p>
      ) : null}
      {!loading && !error && visibleBranches.length === 0 ? (
        <EmptyState
          compact
          className="min-h-0 flex-1"
          icon={<GitBranchIcon />}
          title={t("branchManage.empty")}
          description={t("branchManage.emptyDescription")}
        />
      ) : null}
      {!loading && !error && visibleBranches.length > 0 ? (
        <BranchManageTable
          branches={visibleBranches}
          sortDir={sortDir}
          onToggleSort={() =>
            setSortDir((prev) => (prev === "desc" ? "asc" : "desc"))
          }
          onDelete={openDelete}
          deletingName={deletingName}
          showTracking={scope === "local"}
        />
      ) : null}

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deleteBusy) {
            setDeleteTarget(null);
          }
        }}
      >
        <DialogContent className="max-w-md gap-4 p-5 sm:rounded-lg">
          <DialogHeader>
            <DialogTitle>{t("repo.deleteBranchTitle")}</DialogTitle>
          </DialogHeader>

          <div className="flex gap-3">
            <TriangleAlert
              className="text-chart-4 mt-0.5 size-5 shrink-0"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1 space-y-3">
              <div className="space-y-1">
                <p className="text-foreground text-sm">
                  <Trans
                    i18nKey="repo.deleteBranchQuestion"
                    values={{ name: deleteTarget?.name ?? "" }}
                    components={{
                      name: <span className="font-mono font-medium" />,
                    }}
                  />
                </p>
                <p className="text-muted-foreground text-xs">
                  {t("repo.deleteBranchIrreversible")}
                </p>
              </div>

              {deleteHasRemote ? (
                <div className="space-y-2">
                  <p className="text-muted-foreground text-xs">
                    {t("repo.deleteBranchRemoteHint")}
                  </p>
                  <label className="text-foreground flex cursor-pointer items-center gap-2 text-sm select-none">
                    <input
                      type="checkbox"
                      className="border-input text-primary focus-visible:ring-ring size-3.5 shrink-0 rounded-sm border accent-primary"
                      checked={deleteRemoteAlso}
                      onChange={(event) => setDeleteRemoteAlso(event.target.checked)}
                      disabled={deleteBusy}
                    />
                    <span>{t("repo.deleteBranchRemoteCheckbox")}</span>
                  </label>
                </div>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={deleteBusy}
              onClick={() => setDeleteTarget(null)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteBusy}
              onClick={() => void confirmDelete()}
            >
              {t("repo.deleteBranchAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function compareByTime(
  left: GitBranch,
  right: GitBranch,
  direction: BranchManageSortDirection,
): number {
  const leftMs = parseAuthoredMs(left.tipAuthoredAt);
  const rightMs = parseAuthoredMs(right.tipAuthoredAt);
  if (leftMs === rightMs) {
    return left.name.localeCompare(right.name);
  }
  if (leftMs === null) return 1;
  if (rightMs === null) return -1;
  return direction === "desc" ? rightMs - leftMs : leftMs - rightMs;
}

function parseAuthoredMs(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = dayjs(trimmed);
  return parsed.isValid() ? parsed.valueOf() : null;
}
