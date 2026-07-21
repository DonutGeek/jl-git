import { FormEvent, useEffect, useMemo, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { Check, GitBranch as GitBranchIcon, Search, Tag } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

import { useRepoStore } from "@/store/useRepoStore";

import { toUserMessage } from "@/types/error";
import { GitBranch } from "@/types/git";

interface CreateBranchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 固定起点（如标签名）；有值时不展示分支选择列表 */
  fixedStartPoint?: string | null;
  /** 固定起点展示为标签 */
  fixedStartIsTag?: boolean;
}

/** 创建分支弹窗：名称 + 选择基线分支（不含关联需求 / 新工作区） */
export function CreateBranchDialog({
  open,
  onOpenChange,
  fixedStartPoint = null,
  fixedStartIsTag = false,
}: CreateBranchDialogProps) {
  const { t } = useTranslation();
  const branches = useRepoStore((state) => state.branches);
  const createBranch = useRepoStore((state) => state.createBranch);
  const loading = useRepoStore((state) => state.loading);

  const [name, setName] = useState("");
  const [filter, setFilter] = useState("");
  const [startPoint, setStartPoint] = useState<string>("");
  const [checkoutAfterCreate, setCheckoutAfterCreate] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const lockedStart = Boolean(fixedStartPoint?.trim());

  const allLocalBranches = useMemo(
    () => branches.filter((branch) => !branch.isRemote),
    [branches],
  );
  const remoteBranches = useMemo(
    () => branches.filter((branch) => branch.isRemote),
    [branches],
  );

  // 默认分支：后端标记 isDefault；无标记时回退 main/master
  const defaultBranch = useMemo(() => {
    const marked = allLocalBranches.find((branch) => branch.isDefault);
    if (marked) {
      return marked;
    }
    return (
      allLocalBranches.find((branch) => branch.name === "main" || branch.name === "master") ?? null
    );
  }, [allLocalBranches]);

  // 本地分支列表排除默认分支，避免与「默认分支」分组重复
  const localBranches = useMemo(() => {
    if (!defaultBranch) {
      return allLocalBranches;
    }
    return allLocalBranches.filter((branch) => branch.name !== defaultBranch.name);
  }, [allLocalBranches, defaultBranch]);

  // 仅在打开瞬间重置表单，避免输入时被 branches 引用变化冲掉
  useEffect(() => {
    if (!open) {
      return;
    }

    const snapshot = useRepoStore.getState();
    const locals = snapshot.branches.filter((branch) => !branch.isRemote);
    const remotes = snapshot.branches.filter((branch) => branch.isRemote);
    const current = snapshot.status?.branch ?? null;

    setName("");
    setFilter("");
    setSubmitting(false);
    const locked = fixedStartPoint?.trim() ?? "";
    if (locked) {
      setStartPoint(locked);
      // 从标签创建时默认不自动检出，与常见客户端一致
      setCheckoutAfterCreate(false);
    } else {
      setStartPoint(current ?? locals[0]?.name ?? remotes[0]?.name ?? "");
      setCheckoutAfterCreate(true);
    }
  }, [open, fixedStartPoint]);

  const filterLower = filter.trim().toLowerCase();

  const filteredLocal = useMemo(() => {
    if (!filterLower) {
      return localBranches;
    }
    return localBranches.filter((branch) => branch.name.toLowerCase().includes(filterLower));
  }, [localBranches, filterLower]);

  const filteredRemote = useMemo(() => {
    if (!filterLower) {
      return remoteBranches;
    }
    return remoteBranches.filter((branch) => branch.name.toLowerCase().includes(filterLower));
  }, [remoteBranches, filterLower]);

  const canSubmit =
    !submitting && !loading && name.trim().length > 0 && startPoint.trim().length > 0;

  function handleOpenChange(next: boolean): void {
    if (!next && submitting) {
      return;
    }
    onOpenChange(next);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    const branchName = name.trim();
    const start = startPoint.trim();

    // 无论成败都先关弹窗，步骤与结果只看操作日志
    flushSync(() => {
      onOpenChange(false);
    });

    setSubmitting(true);
    try {
      await createBranch(branchName, {
        startPoint: start,
        checkout: checkoutAfterCreate,
      });
      toast.success(
        checkoutAfterCreate
          ? t("repo.createBranchSuccess", { name: branchName })
          : t("repo.createBranchSuccessNoCheckout", { name: branchName }),
      );
    } catch (submitError) {
      toast.error(toUserMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          "flex flex-col gap-4 overflow-hidden p-5 sm:rounded-lg",
          lockedStart ? "max-w-md" : "max-h-[min(640px,85vh)] max-w-xl",
        )}
      >
        <DialogHeader>
          <DialogTitle>{t("repo.createBranchTitle")}</DialogTitle>
        </DialogHeader>

        <form className="flex min-h-0 flex-1 flex-col gap-4" onSubmit={(event) => void handleSubmit(event)}>
          {lockedStart ? (
            <div className="space-y-1.5">
              <p className="text-muted-foreground text-sm">
                {t("repo.createBranchBasedOn")}
              </p>
              <div className="border-border bg-muted/30 flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                {fixedStartIsTag ? (
                  <Tag className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <GitBranchIcon
                    className="text-muted-foreground size-3.5 shrink-0"
                    aria-hidden="true"
                  />
                )}
                <span className="min-w-0 truncate font-mono">{startPoint}</span>
              </div>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <label htmlFor="branch-name" className="text-sm font-medium">
              {t("repo.branchName")}
            </label>
            <Input
              id="branch-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("repo.branchNamePlaceholder")}
              autoFocus
              disabled={submitting}
            />
          </div>

          {lockedStart ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={checkoutAfterCreate}
                onChange={(event) => setCheckoutAfterCreate(event.target.checked)}
                disabled={submitting}
              />
              <span>{t("repo.createBranchCheckoutAfter")}</span>
            </label>
          ) : (
            <div className="border-border flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border">
              <div className="border-border flex shrink-0 items-center gap-2 border-b px-3 py-2">
                <p className="min-w-0 flex-1 truncate text-xs">
                  <span className="text-muted-foreground">{t("repo.createBranchBasedOn")}</span>{" "}
                  <span className="text-foreground font-medium font-mono">
                    {startPoint || "—"}
                  </span>
                </p>
                <div className="relative w-36 shrink-0">
                  <Search
                    className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2"
                    aria-hidden="true"
                  />
                  <Input
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                    placeholder={t("repo.filter")}
                    className="h-7 pl-7 text-xs"
                    aria-label={t("repo.filter")}
                    disabled={submitting}
                  />
                </div>
              </div>

              <div className="min-h-0 flex-1">
                <ScrollArea className="h-full py-1">
                  {defaultBranch &&
                  (!filterLower || defaultBranch.name.toLowerCase().includes(filterLower)) ? (
                    <BranchPickSection title={t("repo.defaultBranch")}>
                      <BranchPickRow
                        branch={defaultBranch}
                        selected={startPoint === defaultBranch.name}
                        onSelect={setStartPoint}
                        disabled={submitting}
                      />
                    </BranchPickSection>
                  ) : null}

                  {filteredLocal.length > 0 ? (
                    <BranchPickSection title={t("repo.localBranches")}>
                      {filteredLocal.map((branch) => (
                        <BranchPickRow
                          key={`local:${branch.name}`}
                          branch={branch}
                          selected={startPoint === branch.name}
                          onSelect={setStartPoint}
                          disabled={submitting}
                        />
                      ))}
                    </BranchPickSection>
                  ) : null}

                  {filteredRemote.length > 0 ? (
                    <BranchPickSection title={t("repo.remoteBranches")}>
                      {filteredRemote.map((branch) => (
                        <BranchPickRow
                          key={`remote:${branch.name}`}
                          branch={branch}
                          selected={startPoint === branch.name}
                          onSelect={setStartPoint}
                          disabled={submitting}
                        />
                      ))}
                    </BranchPickSection>
                  ) : null}

                  {filteredLocal.length === 0 &&
                  filteredRemote.length === 0 &&
                  !(
                    defaultBranch &&
                    (!filterLower || defaultBranch.name.toLowerCase().includes(filterLower))
                  ) ? (
                    <p className="text-muted-foreground px-3 py-4 text-xs">
                      {t("repo.branchesNoMatch")}
                    </p>
                  ) : null}
                </ScrollArea>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => handleOpenChange(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {t("repo.createBranchAction")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BranchPickSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="px-1 py-1">
      <p className="text-muted-foreground px-2 py-1 text-[11px] font-medium tracking-wide">
        {title}
      </p>
      <ul>{children}</ul>
    </section>
  );
}

interface BranchPickRowProps {
  branch: GitBranch;
  selected: boolean;
  disabled: boolean;
  onSelect: (name: string) => void;
}

function BranchPickRow({ branch, selected, disabled, onSelect }: BranchPickRowProps) {
  const isCurrent = branch.isCurrent;

  return (
    <li>
      <button
        type="button"
        disabled={disabled}
        className={cn(
          "flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left text-sm transition-colors disabled:cursor-not-allowed",
          selected
            ? "bg-primary/10 text-primary"
            : "hover:bg-accent/60 text-foreground",
        )}
        onClick={() => onSelect(branch.name)}
        aria-current={isCurrent ? "true" : undefined}
      >
        {isCurrent ? (
          <Check className="size-3.5 shrink-0" aria-hidden="true" />
        ) : (
          <GitBranchIcon className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
        )}
        <span className="min-w-0 flex-1 truncate font-mono text-xs">{branch.name}</span>
      </button>
    </li>
  );
}
