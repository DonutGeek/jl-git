import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Cloud,
  ListFilter,
  Monitor,
  Plus,
  RefreshCw,
  Settings,
} from "lucide-react";
import { toast } from "sonner";

import { BranchGroup, BranchTree } from "@/components/git/BranchTree";
import { CreateBranchDialog } from "@/components/git/CreateBranchDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { useRepoStore } from "@/store/useRepoStore";

import { toUserMessage } from "@/types/error";
import { GitBranch } from "@/types/git";

import { buildBranchTree } from "@/utils/branchTree";

/** 左栏：本地/远端分支树，点击非当前分支即切换 */
export function BranchList() {
  const { t } = useTranslation();
  const branches = useRepoStore((state) => state.branches);
  const loading = useRepoStore((state) => state.loading);
  const checkout = useRepoStore((state) => state.checkout);
  const refreshBranches = useRepoStore((state) => state.refreshBranches);

  const [checkingOutName, setCheckingOutName] = useState<string | null>(null);
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(new Set());
  const [localOpen, setLocalOpen] = useState(true);
  const [remoteOpen, setRemoteOpen] = useState(true);
  const [filter, setFilter] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const filterLower = filter.trim().toLowerCase();

  const filteredBranches = useMemo(() => {
    if (filterLower.length === 0) {
      return branches;
    }
    return branches.filter((branch) => branch.name.toLowerCase().includes(filterLower));
  }, [branches, filterLower]);

  const localBranches = useMemo(
    () => filteredBranches.filter((branch) => !branch.isRemote),
    [filteredBranches],
  );
  const remoteBranches = useMemo(
    () => filteredBranches.filter((branch) => branch.isRemote),
    [filteredBranches],
  );

  const localTree = useMemo(() => buildBranchTree(localBranches), [localBranches]);
  const remoteTree = useMemo(() => buildBranchTree(remoteBranches), [remoteBranches]);

  function toggleCollapse(key: string): void {
    setCollapsedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  async function handleCheckout(branch: GitBranch): Promise<void> {
    setCheckingOutName(branch.name);

    try {
      await checkout(branch.name);
      toast.success(t("repo.checkoutSuccess", { branch: branch.name }));
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setCheckingOutName(null);
    }
  }

  async function handleRefresh(): Promise<void> {
    setRefreshing(true);
    try {
      await refreshBranches();
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setRefreshing(false);
    }
  }

  function handleSoon(action: string): void {
    toast.message(t("repo.syncComingSoon", { action }));
  }

  const isEmpty = branches.length === 0;
  const noMatch = !isEmpty && filteredBranches.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-1.5 px-2.5 pt-2.5">
        <div className="flex items-center gap-1">
          <h2 className="text-muted-foreground min-w-0 flex-1 text-[11px] font-semibold tracking-wide uppercase">
            {t("repo.branches")}
          </h2>

          <div className="flex shrink-0 items-center gap-0.5">
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground size-6 [&_svg]:size-3.5"
                  aria-label={t("repo.newBranch")}
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t("repo.newBranch")}</TooltipContent>
            </Tooltip>

            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground size-6 [&_svg]:size-3.5"
                  aria-label={t("repo.refresh")}
                  disabled={refreshing || loading}
                  onClick={() => void handleRefresh()}
                >
                  <RefreshCw
                    className={cn(refreshing && "animate-spin")}
                    aria-hidden="true"
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t("repo.refresh")}</TooltipContent>
            </Tooltip>

            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground size-6 [&_svg]:size-3.5"
                  aria-label={t("repo.branchFilterActions")}
                  onClick={() => handleSoon(t("repo.branchFilterActions"))}
                >
                  <ListFilter aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t("repo.branchFilterActions")}</TooltipContent>
            </Tooltip>

            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground size-6 [&_svg]:size-3.5"
                  aria-label={t("repo.branchSettings")}
                  onClick={() => handleSoon(t("repo.branchSettings"))}
                >
                  <Settings aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t("repo.branchSettings")}</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <Input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder={t("repo.filter")}
          className="h-7 text-xs"
          aria-label={t("repo.filter")}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-1 py-1">
        {isEmpty ? (
          <p className="text-muted-foreground px-2 py-3 text-xs">{t("repo.branchesEmpty")}</p>
        ) : noMatch ? (
          <p className="text-muted-foreground px-2 py-3 text-xs">{t("repo.branchesNoMatch")}</p>
        ) : (
          <div className="flex flex-col">
            <BranchGroup
              icon={<Monitor className="text-muted-foreground shrink-0" aria-hidden="true" />}
              label={t("repo.local")}
              open={localOpen}
              onToggle={() => setLocalOpen((prev) => !prev)}
            >
              {/* depth=1：相对「本地」缩进一级并画引导线 */}
              <BranchTree
                nodes={localTree}
                depth={1}
                variant="local"
                treeId="local"
                collapsedPaths={collapsedPaths}
                onToggleCollapse={toggleCollapse}
                onCheckout={(branch) => void handleCheckout(branch)}
                checkingOutName={checkingOutName}
                disabled={loading}
              />
            </BranchGroup>

            <BranchGroup
              icon={<Cloud className="text-muted-foreground shrink-0" aria-hidden="true" />}
              label={t("repo.remote")}
              open={remoteOpen}
              onToggle={() => setRemoteOpen((prev) => !prev)}
              trailing={
                <Tooltip delayDuration={300}>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-foreground size-6 shrink-0 hover:bg-transparent [&_svg]:size-3.5"
                      aria-label={t("repo.newBranch")}
                      onClick={() => setCreateOpen(true)}
                    >
                      <Plus aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{t("repo.newBranch")}</TooltipContent>
                </Tooltip>
              }
            >
              <BranchTree
                nodes={remoteTree}
                depth={1}
                variant="remote"
                treeId="remote"
                collapsedPaths={collapsedPaths}
                onToggleCollapse={toggleCollapse}
                onCheckout={(branch) => void handleCheckout(branch)}
                checkingOutName={checkingOutName}
                disabled={loading}
              />
            </BranchGroup>
          </div>
        )}
      </div>

      <CreateBranchDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
