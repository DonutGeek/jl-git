import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { GitBranch as GitBranchIcon, Tag } from "lucide-react";
import { toast } from "sonner";

import { GitRefPicker } from "@/components/git/GitRefPicker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { useRepoStore } from "@/store/useRepoStore";
import { listRemotes } from "@/services/git";
import { toUserMessage } from "@/types/error";
import { filterAndSortBranches, readBranchListPrefs } from "@/utils/branchListPrefs";
import { filterAndSortTags, readTagListPrefs } from "@/utils/tagListPrefs";

/** 内部键前缀，避免分支与标签同名冲突；提交时取 value（真实 ref） */
const REF_PREFIX = {
  local: "local:",
  remote: "remote:",
  tag: "tag:",
} as const;

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
  const status = useRepoStore((state) => state.status);
  const branches = useRepoStore((state) => state.branches);
  const tags = useRepoStore((state) => state.tags);
  const createTag = useRepoStore((state) => state.createTag);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  /** 已选 git ref 名（非编码键） */
  const [ref, setRef] = useState("");
  const [remote, setRemote] = useState<string | null>(null);
  const [push, setPush] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lockedRef = Boolean(fixedRef?.trim());
  const currentBranch = status?.detached
    ? null
    : (status?.branch ??
      branches.find((branch) => branch.isCurrent && !branch.isRemote)?.name ??
      null);
  const selectedRef = ref || currentBranch || "";

  // 与侧栏分支/标签列表共用排序偏好
  const refOptions = useMemo(() => {
    const branchPrefs = readBranchListPrefs();
    const tagPrefs = readTagListPrefs();
    const sortedBranches = filterAndSortBranches(branches, branchPrefs, "");
    const sortedTags = filterAndSortTags(tags, tagPrefs, "");
    const localBranches = sortedBranches.filter((branch) => !branch.isRemote);
    const remoteBranches = sortedBranches.filter((branch) => branch.isRemote);
    return [
      ...localBranches.map((branch) => ({
        key: `${REF_PREFIX.local}${branch.name}`,
        value: branch.name,
        label: branch.name,
      })),
      ...remoteBranches.map((branch) => ({
        key: `${REF_PREFIX.remote}${branch.name}`,
        value: branch.name,
        label: branch.name,
      })),
      ...sortedTags.map((tag) => ({
        key: `${REF_PREFIX.tag}${tag.name}`,
        value: tag.name,
        label: tag.name,
      })),
    ];
  }, [branches, tags]);

  useEffect(() => {
    if (!open || !repoPath) return;
    let active = true;
    void listRemotes(repoPath)
      .then((remotes) => {
        if (!active) return;
        setRemote((remotes.find((item) => item.name === "origin") ?? remotes[0])?.name ?? null);
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
    setName("");
    setMessage("");
    setBusy(false);
    setError(null);
    setPush(true);
    setRef("");
  }, [open, fixedRef]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const baseRef = (lockedRef ? fixedRef : selectedRef)?.trim();
    if (busy || !name.trim() || !baseRef) return;
    setBusy(true);
    setError(null);
    try {
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

  const canSubmit = !busy && name.trim().length > 0 && (lockedRef || selectedRef.trim().length > 0);

  function handleOpenChange(next: boolean): void {
    // 执行中禁止关闭，避免重复提交
    if (busy && !next) return;
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn("flex max-w-md flex-col gap-4 overflow-hidden p-5 sm:rounded-lg")}
      >
        <DialogHeader>
          <DialogTitle>{t("repo.createTagTitle")}</DialogTitle>
        </DialogHeader>
        <form
          className="flex min-h-0 flex-1 flex-col gap-4"
          onSubmit={(event) => void submit(event)}
        >
          <FieldGroup className="gap-4">
            {lockedRef ? (
              <Field>
                <FieldLabel>{t("repo.tagBasedOn")}</FieldLabel>
                <div className="border-border bg-muted/30 flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  {fixedRefIsTag ? (
                    <Tag className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <GitBranchIcon
                      className="text-muted-foreground size-3.5 shrink-0"
                      aria-hidden="true"
                    />
                  )}
                  <span className="min-w-0 truncate font-mono">{fixedRef}</span>
                </div>
              </Field>
            ) : (
              <Field>
                <FieldLabel htmlFor="create-tag-base">{t("repo.tagBasedOn")}</FieldLabel>
                <GitRefPicker
                  id="create-tag-base"
                  value={selectedRef}
                  options={refOptions}
                  disabled={busy}
                  onValueChange={setRef}
                />
              </Field>
            )}

            <Field>
              <FieldLabel htmlFor="create-tag-name">{t("repo.tagName")}</FieldLabel>
              <Input
                id="create-tag-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("repo.tagNamePlaceholder")}
                autoFocus
                disabled={busy}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="create-tag-message">{t("repo.tagMessage")}</FieldLabel>
              <Input
                id="create-tag-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder={t("repo.tagMessagePlaceholder")}
                disabled={busy}
              />
            </Field>
            <Field orientation="horizontal" data-disabled={!remote || undefined}>
              <Checkbox
                id="create-tag-push"
                checked={push && Boolean(remote)}
                onCheckedChange={(checked) => setPush(checked === true)}
                disabled={busy || !remote}
              />
              <FieldContent>
                <FieldLabel htmlFor="create-tag-push">{t("repo.pushTag")}</FieldLabel>
                {!remote ? (
                  <FieldDescription>{t("repo.tagPushUnavailable")}</FieldDescription>
                ) : null}
              </FieldContent>
            </Field>
            {error ? (
              <Field data-invalid>
                <FieldError>{error}</FieldError>
              </Field>
            ) : null}
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => handleOpenChange(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {busy ? <Spinner className="size-3.5" /> : null}
              {t("repo.createTagAction")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
