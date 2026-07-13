import { FormEvent, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Check, GitBranch as GitBranchIcon, Search } from "lucide-react";
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
import { cn } from "@/lib/utils";

import { useRepoStore } from "@/store/useRepoStore";

import { toUserMessage } from "@/types/error";
import { GitBranch } from "@/types/git";

interface CreateBranchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** 创建分支弹窗：名称 + 选择基线分支（不含关联需求 / 新工作区） */
export function CreateBranchDialog({ open, onOpenChange }: CreateBranchDialogProps) {
  const { t } = useTranslation();
  const branches = useRepoStore((state) => state.branches);
  const status = useRepoStore((state) => state.status);
  const createBranch = useRepoStore((state) => state.createBranch);
  const loading = useRepoStore((state) => state.loading);

  const currentBranch = status?.branch ?? null;

  const [name, setName] = useState("");
  const [filter, setFilter] = useState("");
  const [startPoint, setStartPoint] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const localBranches = useMemo(
    () => branches.filter((branch) => !branch.isRemote),
    [branches],
  );
  const remoteBranches = useMemo(
    () => branches.filter((branch) => branch.isRemote),
    [branches],
  );

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
    setError(null);
    setSubmitting(false);
    setStartPoint(current ?? locals[0]?.name ?? remotes[0]?.name ?? "");
  }, [open]);

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

  const defaultBranch = useMemo(() => {
    if (currentBranch) {
      return localBranches.find((branch) => branch.name === currentBranch) ?? null;
    }
    return (
      localBranches.find((branch) => branch.name === "main" || branch.name === "master") ?? null
    );
  }, [currentBranch, localBranches]);

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

    setSubmitting(true);
    setError(null);

    try {
      await createBranch(name.trim(), {
        startPoint: startPoint.trim(),
        checkout: true,
      });
      toast.success(t("repo.createBranchSuccess", { name: name.trim() }));
      onOpenChange(false);
    } catch (submitError) {
      setError(toUserMessage(submitError));
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[min(640px,85vh)] max-w-xl flex-col gap-4 overflow-hidden p-5 sm:rounded-lg">
        <DialogHeader>
          <DialogTitle>{t("repo.createBranchTitle")}</DialogTitle>
        </DialogHeader>

        <form className="flex min-h-0 flex-1 flex-col gap-4" onSubmit={(event) => void handleSubmit(event)}>
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
              aria-invalid={Boolean(error)}
            />
          </div>

          <div className="border-border flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border">
            <div className="border-border flex shrink-0 items-center gap-2 border-b px-3 py-2">
              <p className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
                {t("repo.createBranchBasedOn", { branch: startPoint || "—" })}
              </p>
              <div className="relative w-[140px] shrink-0">
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

            <div className="min-h-0 flex-1 overflow-auto py-1">
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

              {filteredLocal.length === 0 && filteredRemote.length === 0 ? (
                <p className="text-muted-foreground px-3 py-4 text-xs">{t("repo.branchesNoMatch")}</p>
              ) : null}
            </div>
          </div>

          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}

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
      >
        {selected ? (
          <Check className="size-3.5 shrink-0" aria-hidden="true" />
        ) : (
          <GitBranchIcon className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
        )}
        <span className="min-w-0 flex-1 truncate font-mono text-xs">{branch.name}</span>
      </button>
    </li>
  );
}
