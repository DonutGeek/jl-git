import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Plus, RefreshCw, Settings } from "lucide-react";

import { BranchListFilterMenu } from "@/components/git/BranchListFilterMenu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import type { BranchListPrefs } from "@/utils/branchListPrefs";

interface BranchListChromeProps {
  filter: string;
  prefs: BranchListPrefs;
  dataPending?: boolean;
  refreshing?: boolean;
  children: ReactNode;
  onFilterChange: (value: string) => void;
  onPrefsChange: (patch: Partial<BranchListPrefs>) => void;
  onCreate: () => void;
  onRefresh: () => void;
  onManage: () => void;
}

export function BranchListChrome({
  filter,
  prefs,
  dataPending = false,
  refreshing = false,
  children,
  onFilterChange,
  onPrefsChange,
  onCreate,
  onRefresh,
  onManage,
}: BranchListChromeProps) {
  const { t } = useTranslation();

  return (
    <div className="flex h-full min-h-0 flex-col" data-repo-shell="branches">
      <div className="shrink-0">
        <div className="flex h-10 items-center gap-1 px-3">
          <h2 className="text-muted-foreground min-w-0 flex-1 text-xs font-semibold">
            {t("repo.branches")}
          </h2>

          <div className="flex shrink-0 items-center gap-0.5">
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground size-7 [&_svg]:size-3.5"
                  aria-label={t("repo.newBranch")}
                  disabled={dataPending}
                  onClick={onCreate}
                >
                  <Plus aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("repo.newBranch")}</TooltipContent>
            </Tooltip>

            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground size-7 [&_svg]:size-3.5"
                  aria-label={t("repo.refresh")}
                  disabled={dataPending || refreshing}
                  onClick={onRefresh}
                >
                  {refreshing ? <Spinner className="size-3.5" /> : <RefreshCw aria-hidden="true" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("repo.refresh")}</TooltipContent>
            </Tooltip>

            <BranchListFilterMenu prefs={prefs} disabled={dataPending} onChange={onPrefsChange} />

            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground size-7 [&_svg]:size-3.5"
                  aria-label={t("repo.branchSettings")}
                  disabled={dataPending}
                  onClick={onManage}
                >
                  <Settings aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("repo.branchSettings")}</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div className="px-3 pb-1">
          <Input
            value={filter}
            onChange={(event) => onFilterChange(event.target.value)}
            placeholder={t("repo.branchFilterKeyword")}
            className="h-8 text-xs shadow-none"
            aria-label={t("repo.branchFilterKeyword")}
          />
        </div>
      </div>

      {children}
    </div>
  );
}
