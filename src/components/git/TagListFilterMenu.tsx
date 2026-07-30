import { useTranslation } from "react-i18next";
import { ListFilter } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  DEFAULT_TAG_LIST_PREFS,
  isTagListPrefsDefault,
  type TagListPrefs,
  type TagListSort,
} from "@/utils/tagListPrefs";

interface TagListFilterMenuProps {
  prefs: TagListPrefs;
  disabled?: boolean;
  onChange: (patch: Partial<TagListPrefs>) => void;
}

/** 侧栏标签排序菜单（仅升序 / 降序，按名称） */
export function TagListFilterMenu({ prefs, disabled = false, onChange }: TagListFilterMenuProps) {
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
              disabled={disabled}
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
          onCheckedChange={(checked) => setSort(checked ? "nameAsc" : DEFAULT_TAG_LIST_PREFS.sort)}
        >
          {t("repo.sortAsc")}
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={prefs.sort === "nameDesc"}
          onCheckedChange={(checked) => setSort(checked ? "nameDesc" : DEFAULT_TAG_LIST_PREFS.sort)}
        >
          {t("repo.sortDesc")}
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
