import { useTranslation } from "react-i18next";
import { ListFilter } from "lucide-react";

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
  DEFAULT_TAG_LIST_PREFS,
  isTagListPrefsDefault,
  type TagListPrefs,
  type TagListSort,
} from "@/utils/tagListPrefs";

interface TagListFilterMenuProps {
  prefs: TagListPrefs;
  onChange: (patch: Partial<TagListPrefs>) => void;
}

/** 侧栏标签排序菜单（交互对齐分支列表） */
export function TagListFilterMenu({
  prefs,
  onChange,
}: TagListFilterMenuProps) {
  const { t } = useTranslation();
  const modified = !isTagListPrefsDefault(prefs);

  function setSort(sort: TagListSort): void {
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
              aria-label={t("repo.tagFilterActions")}
            >
              <ListFilter aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{t("repo.tagFilterActions")}</TooltipContent>
      </Tooltip>

      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuCheckboxItem
          checked={prefs.sort === "nameAsc"}
          onCheckedChange={(checked) =>
            setSort(checked ? "nameAsc" : DEFAULT_TAG_LIST_PREFS.sort)
          }
          onSelect={(event) => event.preventDefault()}
        >
          {t("repo.tagFilterSortNameAsc")}
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={prefs.sort === "nameDesc"}
          onCheckedChange={(checked) =>
            setSort(checked ? "nameDesc" : DEFAULT_TAG_LIST_PREFS.sort)
          }
          onSelect={(event) => event.preventDefault()}
        >
          {t("repo.tagFilterSortNameDesc")}
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={prefs.sort === "timeDesc"}
          onCheckedChange={(checked) =>
            setSort(checked ? "timeDesc" : DEFAULT_TAG_LIST_PREFS.sort)
          }
          onSelect={(event) => event.preventDefault()}
        >
          {t("repo.tagFilterSortTimeDesc")}
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={prefs.sort === "timeAsc"}
          onCheckedChange={(checked) =>
            setSort(checked ? "timeAsc" : DEFAULT_TAG_LIST_PREFS.sort)
          }
          onSelect={(event) => event.preventDefault()}
        >
          {t("repo.tagFilterSortTimeAsc")}
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
