import { FormEvent, useEffect, useMemo, useState, type ReactNode } from "react";
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
import { listRemotes } from "@/services/git";
import { toUserMessage } from "@/types/error";

/** 空字符串表示当前 HEAD */
const HEAD_REF = "";

interface CreateTagDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 固定基点（如已有标签名）；有值时不展示选择器 */
  fixedRef?: string | null;
  /** 固定基点展示为标签 */
  fixedRefIsTag?: boolean;
}

export function CreateTagDialog({
  open,
  onOpenChange,
  fixedRef = null,
  fixedRefIsTag = false,
}: CreateTagDialogProps) {
  const { t } = useTranslation();
  const repoPath = useRepoStore((state) => state.repoPath);
  const branches = useRepoStore((state) => state.branches);
  const tags = useRepoStore((state) => state.tags);
  const createTag = useRepoStore((state) => state.createTag);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [ref, setRef] = useState(HEAD_REF);
  const [filter, setFilter] = useState("");
  const [remote, setRemote] = useState<string | null>(null);
  const [push, setPush] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lockedRef = Boolean(fixedRef?.trim());

  const localBranches = useMemo(
    () => branches.filter((branch) => !branch.isRemote),
    [branches],
  );
  const remoteBranches = useMemo(
    () => branches.filter((branch) => branch.isRemote),
    [branches],
  );

  useEffect(() => {
    if (!open || !repoPath) return;
    let active = true;
    void listRemotes(repoPath)
      .then((remotes) => {
        if (!active) return;
        setRemote(
          (remotes.find((item) => item.name === "origin") ?? remotes[0])?.name ??
            null,
        );
      })
      .catch((loadError: unknown) => {
        if (active) setError(toUserMessage(loadError));
      });
    return () => {
      active = false;
    };
  }, [open, repoPath]);

  useEffect(() => {
    if (!open) return;
    const snapshot = useRepoStore.getState();
    const current = snapshot.status?.branch ?? null;
    setName("");
    setMessage("");
    setFilter("");
    setBusy(false);
    setError(null);
    setPush(true);
    const locked = fixedRef?.trim() ?? "";
    if (locked) {
      setRef(locked);
    } else {
      // 默认基于当前分支；分离 HEAD 时用「当前 HEAD」
      setRef(current ?? HEAD_REF);
    }
  }, [open, fixedRef]);

  const filterLower = filter.trim().toLowerCase();

  const filteredLocal = useMemo(() => {
    if (!filterLower) return localBranches;
    return localBranches.filter((branch) =>
      branch.name.toLowerCase().includes(filterLower),
    );
  }, [localBranches, filterLower]);

  const filteredRemote = useMemo(() => {
    if (!filterLower) return remoteBranches;
    return remoteBranches.filter((branch) =>
      branch.name.toLowerCase().includes(filterLower),
    );
  }, [remoteBranches, filterLower]);

  const filteredTags = useMemo(() => {
    if (!filterLower) return tags;
    return tags.filter((tag) => tag.name.toLowerCase().includes(filterLower));
  }, [tags, filterLower]);

  const headMatches =
    !filterLower || t("repo.tagCurrentHead").toLowerCase().includes(filterLower);

  const hasPickMatches =
    headMatches ||
    filteredLocal.length > 0 ||
    filteredRemote.length > 0 ||
    filteredTags.length > 0;

  const selectedLabel = useMemo(() => {
    if (ref === HEAD_REF) return t("repo.tagCurrentHead");
    return ref;
  }, [ref, t]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const baseRef = (lockedRef ? fixedRef : ref)?.trim() || undefined;
      const result = await createTag({
        name: name.trim(),
        message: message.trim() || undefined,
        ref: baseRef,
        push: push && Boolean(remote),
        remote: remote ?? undefined,
      });
      onOpenChange(false);
      if (push && !result.pushed) {
        toast.warning(t("repo.tagPushFailed", { message: result.pushError ?? "" }));
      } else {
        toast.success(t("repo.createTagSuccess", { name: name.trim() }));
      }
    } catch (submitError) {
      setError(toUserMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex flex-col gap-4 overflow-hidden p-5 sm:rounded-lg",
          lockedRef ? "max-w-md" : "max-h-[min(640px,85vh)] max-w-xl",
        )}
      >
        <DialogHeader>
          <DialogTitle>{t("repo.createTagTitle")}</DialogTitle>
        </DialogHeader>
        <form
          className="flex min-h-0 flex-1 flex-col gap-4"
          onSubmit={(event) => void submit(event)}
        >
          {lockedRef ? (
            <div className="space-y-1.5">
              <p className="text-sm font-medium">{t("repo.tagBasedOn")}</p>
              <div className="border-border bg-muted/30 flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                {fixedRefIsTag ? (
                  <Tag
                    className="text-muted-foreground size-3.5 shrink-0"
                    aria-hidden="true"
                  />
                ) : (
                  <GitBranchIcon
                    className="text-muted-foreground size-3.5 shrink-0"
                    aria-hidden="true"
                  />
                )}
                <span className="min-w-0 truncate font-mono">{fixedRef}</span>
              </div>
            </div>
          ) : (
            <div className="border-border flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border">
              <div className="border-border flex shrink-0 items-center gap-2 border-b px-3 py-2">
                <p className="min-w-0 flex-1 truncate text-xs">
                  <span className="text-muted-foreground">{t("repo.tagBasedOn")}</span>{" "}
                  <span className="text-foreground font-medium font-mono">
                    {selectedLabel}
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
                    disabled={busy}
                  />
                </div>
              </div>

              <div className="min-h-0 flex-1">
                <ScrollArea className="h-full max-h-64 py-1">
                  {headMatches ? (
                    <ul className="px-1 py-1">
                      <PickRow
                        icon="head"
                        label={t("repo.tagCurrentHead")}
                        selected={ref === HEAD_REF}
                        disabled={busy}
                        onSelect={() => setRef(HEAD_REF)}
                      />
                    </ul>
                  ) : null}

                  {filteredLocal.length > 0 ? (
                    <PickSection title={t("repo.localBranches")}>
                      {filteredLocal.map((branch) => (
                        <PickRow
                          key={`local:${branch.name}`}
                          icon="branch"
                          label={branch.name}
                          selected={ref === branch.name}
                          isCurrent={branch.isCurrent}
                          disabled={busy}
                          onSelect={() => setRef(branch.name)}
                        />
                      ))}
                    </PickSection>
                  ) : null}

                  {filteredRemote.length > 0 ? (
                    <PickSection title={t("repo.remoteBranches")}>
                      {filteredRemote.map((branch) => (
                        <PickRow
                          key={`remote:${branch.name}`}
                          icon="branch"
                          label={branch.name}
                          selected={ref === branch.name}
                          disabled={busy}
                          onSelect={() => setRef(branch.name)}
                        />
                      ))}
                    </PickSection>
                  ) : null}

                  {filteredTags.length > 0 ? (
                    <PickSection title={t("repo.tags")}>
                      {filteredTags.map((tag) => (
                        <PickRow
                          key={`tag:${tag.name}`}
                          icon="tag"
                          label={tag.name}
                          selected={ref === tag.name}
                          disabled={busy}
                          onSelect={() => setRef(tag.name)}
                        />
                      ))}
                    </PickSection>
                  ) : null}

                  {!hasPickMatches ? (
                    <p className="text-muted-foreground px-3 py-4 text-xs">
                      {t("repo.tagBaseNoMatch")}
                    </p>
                  ) : null}
                </ScrollArea>
              </div>
            </div>
          )}

          <label className="block space-y-1.5 text-sm font-medium">
            <span>{t("repo.tagName")}</span>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("repo.tagNamePlaceholder")}
              autoFocus
              disabled={busy}
            />
          </label>
          <label className="block space-y-1.5 text-sm font-medium">
            <span>{t("repo.tagMessage")}</span>
            <Input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={t("repo.tagMessagePlaceholder")}
              disabled={busy}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={push && Boolean(remote)}
              onChange={(event) => setPush(event.target.checked)}
              disabled={busy || !remote}
            />
            <span>{t("repo.pushTag")}</span>
          </label>
          {!remote ? (
            <p className="text-muted-foreground text-xs">{t("repo.tagPushUnavailable")}</p>
          ) : null}
          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {t("repo.createTagAction")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PickSection({
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

interface PickRowProps {
  icon: "head" | "branch" | "tag";
  label: string;
  selected: boolean;
  disabled: boolean;
  isCurrent?: boolean;
  onSelect: () => void;
}

function PickRow({
  icon,
  label,
  selected,
  disabled,
  isCurrent,
  onSelect,
}: PickRowProps) {
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
        onClick={onSelect}
        aria-current={isCurrent ? "true" : undefined}
      >
        {selected || isCurrent ? (
          <Check className="size-3.5 shrink-0" aria-hidden="true" />
        ) : icon === "tag" ? (
          <Tag className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
        ) : (
          <GitBranchIcon
            className="text-muted-foreground size-3.5 shrink-0"
            aria-hidden="true"
          />
        )}
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-xs",
            icon === "head" ? "" : "font-mono",
          )}
        >
          {label}
        </span>
      </button>
    </li>
  );
}
