import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Check } from "lucide-react";

import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useScrollAreaViewport } from "@/hooks/useScrollAreaViewport";
import { cn } from "@/lib/utils";
import type { GitBranch } from "@/types/git";

const BRANCH_MENU_MAX_HEIGHT_PX = 320;
const BRANCH_MENU_ROW_PX = 32;
const BRANCH_MENU_OVERSCAN = 8;

const scrollAreaClassName = cn(
  "w-full",
  "[&_[data-slot=scroll-area-viewport]>div]:!block [&_[data-slot=scroll-area-viewport]>div]:!min-w-0 [&_[data-slot=scroll-area-viewport]>div]:w-full",
  "[&_[data-slot=scroll-area-scrollbar][data-state=hidden]]:hidden",
);

interface LocalBranchMenuListProps {
  branches: readonly GitBranch[];
  checkingOut: boolean;
  onCheckout: (branchName: string) => void;
}

/** 工具栏等下拉中的本地分支列表：ScrollArea + 虚拟列表 */
export function LocalBranchMenuList({
  branches,
  checkingOut,
  onCheckout,
}: LocalBranchMenuListProps) {
  const { t } = useTranslation();
  const { viewport, bindScrollArea } = useScrollAreaViewport();

  const virtualizer = useVirtualizer({
    count: branches.length,
    getScrollElement: () => viewport,
    estimateSize: () => BRANCH_MENU_ROW_PX,
    overscan: BRANCH_MENU_OVERSCAN,
  });

  if (branches.length === 0) {
    return (
      <div className="p-1">
        <DropdownMenuItem disabled>{t("repo.branchesEmpty")}</DropdownMenuItem>
      </div>
    );
  }

  const listHeight = Math.min(
    BRANCH_MENU_MAX_HEIGHT_PX,
    branches.length * BRANCH_MENU_ROW_PX + 8,
  );

  return (
    <ScrollArea
      ref={bindScrollArea}
      className={scrollAreaClassName}
      style={{ height: listHeight, maxHeight: BRANCH_MENU_MAX_HEIGHT_PX }}
    >
      <div
        className="relative w-full p-1"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const branch = branches[virtualRow.index];
          if (!branch) {
            return null;
          }
          return (
            <div
              key={branch.name}
              data-index={virtualRow.index}
              className="absolute top-0 left-0 w-full"
              style={{
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <DropdownMenuItem
                disabled={branch.isCurrent || checkingOut}
                onSelect={() => {
                  onCheckout(branch.name);
                }}
              >
                <span className="min-w-0 flex-1 truncate">{branch.name}</span>
                {branch.isCurrent ? (
                  <Check className="text-primary size-3.5 shrink-0" aria-hidden="true" />
                ) : null}
              </DropdownMenuItem>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
