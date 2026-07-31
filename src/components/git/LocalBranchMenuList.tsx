import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Search } from "lucide-react";

import { DropdownMenuScrollArea } from "@/components/common/DropdownMenuScrollArea";
import { TruncateStartPath, TRUNCATE_BUDGET_ATTR } from "@/components/common/TruncateStartPath";
import {
  BranchContextMenuContent,
  type BranchContextActions,
} from "@/components/git/BranchContextMenuContent";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { DropdownMenuItem, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { GitBranch } from "@/types/git";
import { isLocalBranchPublished } from "@/utils/branchPublish";
import { useContextMenuOpen } from "@/utils/contextMenuHighlight";

interface LocalBranchMenuListProps {
  branches: readonly GitBranch[];
  checkingOut: boolean;
  onCheckout: (branchName: string) => void;
  /** 与左栏分支树一致的右键动作 */
  contextActions: BranchContextActions;
  /** 当前分支超前远端提交数（推送可用性） */
  aheadCount: number;
  /** 菜单是否打开；关闭时清空搜索 */
  open?: boolean;
}

interface BranchMenuSections {
  current: GitBranch[];
  local: GitBranch[];
  remote: GitBranch[];
}

/** 分组标题行预估高度（含上下 padding） */
const SECTION_LABEL_HEIGHT = 28;

/**
 * 工具栏分支下拉。
 * 分组：默认分支（当前检出）→ 本地分支（其余本地）→ 远端分支。
 * 单击高亮；悬停高亮；双击（或键盘 Enter / Space）检出；右键菜单与左栏一致。
 */
export function LocalBranchMenuList({
  branches,
  checkingOut,
  onCheckout,
  contextActions,
  aheadCount,
  open = true,
}: LocalBranchMenuListProps) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState("");
  /** 单击选中的高亮项（非检出状态） */
  const [highlightedName, setHighlightedName] = useState<string | null>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!open) {
      setFilter("");
      setHighlightedName(null);
      wasOpenRef.current = false;
      return;
    }
    if (!wasOpenRef.current) {
      wasOpenRef.current = true;
      // 刚打开：高亮落到当前检出分支
      setHighlightedName(branches.find((branch) => branch.isCurrent)?.name ?? null);
      return;
    }
    // 打开期间列表刷新：保留仍存在的单击高亮，否则回落到当前分支
    setHighlightedName((prev) => {
      if (prev != null && branches.some((branch) => branch.name === prev)) {
        return prev;
      }
      return branches.find((branch) => branch.isCurrent)?.name ?? null;
    });
  }, [open, branches]);

  const sections = useMemo((): BranchMenuSections => {
    const byName = (left: GitBranch, right: GitBranch) => left.name.localeCompare(right.name);
    const query = filter.trim().toLowerCase();
    const matches = (branch: GitBranch): boolean =>
      !query || branch.name.toLowerCase().includes(query);

    const current = branches.filter((branch) => branch.isCurrent && matches(branch)).sort(byName);
    // 当前已在「默认分支」，本地组不再重复
    const local = branches
      .filter((branch) => !branch.isRemote && !branch.isCurrent && matches(branch))
      .sort(byName);
    const remote = branches
      .filter((branch) => branch.isRemote && branch.name.startsWith("origin/") && matches(branch))
      .sort(byName);

    return { current, local, remote };
  }, [branches, filter]);

  const itemCount = sections.current.length + sections.local.length + sections.remote.length;
  const sectionCount = [
    sections.current.length,
    sections.local.length,
    sections.remote.length,
  ].filter((count) => count > 0).length;
  const hasAnyBranch = branches.length > 0;

  if (!hasAnyBranch) {
    return (
      <div className="p-1.5">
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
        itemCount={itemCount}
        // 行高 32 + 项间 gap-0.5（约 2px，首尾不计双倍，估入行高）
        itemHeight={34}
        extraHeight={sectionCount * SECTION_LABEL_HEIGHT}
        maxHeight={288}
        availableHeightOffset={41}
      >
        {/* 左右对称内边距；滚动条叠在右侧 gutter 内，避免一边宽一边窄 */}
        <div className="px-2 py-1">
          {itemCount === 0 ? (
            <p className="text-muted-foreground px-2 py-3 text-center text-xs">
              {t("repo.branchesNoMatch")}
            </p>
          ) : (
            <>
              <BranchSection
                title={t("repo.defaultBranch")}
                branches={sections.current}
                allBranches={branches}
                checkingOut={checkingOut}
                filter={filter}
                highlightedName={highlightedName}
                aheadCount={aheadCount}
                contextActions={contextActions}
                onHighlight={setHighlightedName}
                onCheckout={onCheckout}
              />
              <BranchSection
                title={t("repo.localBranches")}
                branches={sections.local}
                allBranches={branches}
                checkingOut={checkingOut}
                filter={filter}
                highlightedName={highlightedName}
                aheadCount={aheadCount}
                contextActions={contextActions}
                onHighlight={setHighlightedName}
                onCheckout={onCheckout}
              />
              <BranchSection
                title={t("repo.remoteBranches")}
                branches={sections.remote}
                allBranches={branches}
                checkingOut={checkingOut}
                filter={filter}
                highlightedName={highlightedName}
                aheadCount={aheadCount}
                contextActions={contextActions}
                onHighlight={setHighlightedName}
                onCheckout={onCheckout}
              />
            </>
          )}
        </div>
      </DropdownMenuScrollArea>
    </div>
  );
}

interface BranchSectionProps {
  title: string;
  branches: readonly GitBranch[];
  allBranches: readonly GitBranch[];
  checkingOut: boolean;
  filter: string;
  highlightedName: string | null;
  aheadCount: number;
  contextActions: BranchContextActions;
  onHighlight: (name: string) => void;
  onCheckout: (branchName: string) => void;
}

function BranchSection({
  title,
  branches,
  allBranches,
  checkingOut,
  filter,
  highlightedName,
  aheadCount,
  contextActions,
  onHighlight,
  onCheckout,
}: BranchSectionProps) {
  if (branches.length === 0) {
    return null;
  }

  return (
    <div className="min-w-0">
      <DropdownMenuLabel className="text-muted-foreground px-1.5 py-1.5 text-[11px] font-medium">
        {title}
      </DropdownMenuLabel>
      {/* gap：项与项上下留缝，高亮块不相贴 */}
      <div className="flex min-w-0 flex-col gap-0.5">
        {branches.map((branch) => (
          <BranchMenuItem
            key={`${title}:${branch.name}`}
            branch={branch}
            allBranches={allBranches}
            checkingOut={checkingOut}
            filter={filter}
            isHighlighted={highlightedName === branch.name}
            aheadCount={aheadCount}
            contextActions={contextActions}
            onHighlight={onHighlight}
            onCheckout={onCheckout}
          />
        ))}
      </div>
    </div>
  );
}

interface BranchMenuItemProps {
  branch: GitBranch;
  allBranches: readonly GitBranch[];
  checkingOut: boolean;
  filter: string;
  isHighlighted: boolean;
  aheadCount: number;
  contextActions: BranchContextActions;
  onHighlight: (name: string) => void;
  onCheckout: (branchName: string) => void;
}

function BranchMenuItem({
  branch,
  allBranches,
  checkingOut,
  filter,
  isHighlighted,
  aheadCount,
  contextActions,
  onHighlight,
  onCheckout,
}: BranchMenuItemProps) {
  const { menuOpen, onOpenChange } = useContextMenuOpen(() => {
    onHighlight(branch.name);
  });
  const published = branch.isRemote ? true : isLocalBranchPublished(branch, allBranches);

  return (
    <ContextMenu onOpenChange={onOpenChange}>
      <ContextMenuTrigger asChild>
        <DropdownMenuItem
          disabled={checkingOut}
          className={cn(
            "min-w-0 cursor-pointer rounded-md px-1.5",
            // 悬停 / 键盘焦点高亮（点选态用更实的 accent）
            "hover:bg-accent/70 hover:text-accent-foreground",
            "focus:bg-accent/70 focus:text-accent-foreground",
            // 单击高亮 / 右键锚点高亮
            (isHighlighted || menuOpen) &&
              "bg-accent text-accent-foreground hover:bg-accent focus:bg-accent",
          )}
          onSelect={(event) => {
            event.preventDefault();
            onHighlight(branch.name);
          }}
          onDoubleClick={() => {
            if (branch.isCurrent || checkingOut) {
              return;
            }
            onCheckout(branch.name);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") {
              return;
            }
            if (branch.isCurrent || checkingOut) {
              return;
            }
            event.preventDefault();
            onCheckout(branch.name);
          }}
        >
          <span className="min-w-0 flex-1" {...{ [TRUNCATE_BUDGET_ATTR]: true }}>
            <TruncateStartPath
              path={branch.name}
              highlightQuery={filter}
              className="block min-w-0 w-full font-mono text-sm"
              title={branch.name}
            />
          </span>
          {branch.isCurrent ? <Check className="size-3.5 shrink-0" aria-hidden="true" /> : null}
        </DropdownMenuItem>
      </ContextMenuTrigger>
      <BranchContextMenuContent
        branch={branch}
        disabled={checkingOut}
        published={published}
        aheadCount={aheadCount}
        contextActions={contextActions}
      />
    </ContextMenu>
  );
}
