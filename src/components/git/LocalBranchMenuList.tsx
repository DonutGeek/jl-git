import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Search } from "lucide-react";

import { DropdownMenuScrollArea } from "@/components/common/DropdownMenuScrollArea";
import { HighlightText } from "@/components/common/HighlightText";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { GitBranch } from "@/types/git";

interface LocalBranchMenuListProps {
  branches: readonly GitBranch[];
  checkingOut: boolean;
  onCheckout: (branchName: string) => void;
  /** 菜单是否打开；关闭时清空搜索 */
  open?: boolean;
}

/**
 * 工具栏分支下拉。
 * 结构/间距对齐 HistoryList 用户筛选：搜索 border-b p-1.5，列表 max-h-72 + p-1。
 */
export function LocalBranchMenuList({
  branches,
  checkingOut,
  onCheckout,
  open = true,
}: LocalBranchMenuListProps) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (!open) {
      setFilter("");
    }
  }, [open]);

  const filteredBranches = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) {
      return branches;
    }
    return branches.filter((branch) => branch.name.toLowerCase().includes(query));
  }, [branches, filter]);

  if (branches.length === 0) {
    return (
      <div className="p-1">
        <DropdownMenuItem disabled>{t("repo.branchesEmpty")}</DropdownMenuItem>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col">
      <div className="border-border border-b p-1.5">
        <div className="relative">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2"
            aria-hidden="true"
          />
          <Input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder={t("repo.filter")}
            className="h-7 pl-7 text-xs shadow-none"
            aria-label={t("repo.filter")}
            autoFocus
            onKeyDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          />
        </div>
      </div>

      <DropdownMenuScrollArea
        itemCount={filteredBranches.length}
        maxHeight={288}
        availableHeightOffset={41}
      >
        <div className="p-1">
          {filteredBranches.length === 0 ? (
            <p className="text-muted-foreground px-2 py-3 text-center text-xs">
              {t("repo.branchesNoMatch")}
            </p>
          ) : (
            filteredBranches.map((branch) => (
              <DropdownMenuItem
                key={branch.name}
                // 当前分支不灰显（对齐历史用户筛选：勾选即可）；切换中才禁用
                disabled={checkingOut}
                onSelect={() => {
                  if (branch.isCurrent) {
                    return;
                  }
                  onCheckout(branch.name);
                }}
              >
                <HighlightText
                  text={branch.name}
                  query={filter}
                  className="min-w-0 flex-1 truncate"
                />
                {branch.isCurrent ? (
                  <Check className="size-3.5 shrink-0" aria-hidden="true" />
                ) : null}
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuScrollArea>
    </div>
  );
}
