import { useTranslation } from "react-i18next";
import { ArrowUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  DEFAULT_BRANCH_LIST_PREFS,
  isBranchListPrefsDefault,
  type BranchListPrefs,
  type BranchListSort,
} from "@/utils/branchListPrefs";

interface BranchListFilterMenuProps {
  prefs: BranchListPrefs;
  onChange: (patch: Partial<BranchListPrefs>) => void;
}

/** 侧栏分支排序菜单（勾选风格对齐差异「更多」） */
export function BranchListFilterMenu({
  prefs,
  onChange,
}: BranchListFilterMenuProps) {
  const { t } = useTranslation();
  const modified = !isBranchListPrefsDefault(prefs);

  function setSort(sort: BranchListSort): void {
    onChange({ sort });
  }

  return (
    <DropdownMenu>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "text-muted-foreground size-7 data-[state=open]:bg-accent [&_svg]:size-3.5",
                modified && "bg-accent text-foreground",
              )}
              aria-label={t("repo.branchFilterActions")}
            >
              <ArrowUpDown aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{t("repo.branchFilterActions")}</TooltipContent>
      </Tooltip>

      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuCheckboxItem
          checked={prefs.sort === "nameAsc"}
          onCheckedChange={(checked) =>
            setSort(checked ? "nameAsc" : DEFAULT_BRANCH_LIST_PREFS.sort)
          }
          onSelect={(event) => event.preventDefault()}
        >
          {t("repo.branchFilterSortNameAsc")}
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={prefs.sort === "nameDesc"}
          onCheckedChange={(checked) =>
            setSort(checked ? "nameDesc" : DEFAULT_BRANCH_LIST_PREFS.sort)
          }
          onSelect={(event) => event.preventDefault()}
        >
          {t("repo.branchFilterSortNameDesc")}
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={prefs.sort === "timeDesc"}
          onCheckedChange={(checked) =>
            setSort(checked ? "timeDesc" : DEFAULT_BRANCH_LIST_PREFS.sort)
          }
          onSelect={(event) => event.preventDefault()}
        >
          {t("repo.branchFilterSortTimeDesc")}
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={prefs.sort === "timeAsc"}
          onCheckedChange={(checked) =>
            setSort(checked ? "timeAsc" : DEFAULT_BRANCH_LIST_PREFS.sort)
          }
          onSelect={(event) => event.preventDefault()}
        >
          {t("repo.branchFilterSortTimeAsc")}
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
