import { FormEvent, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Tag } from "lucide-react";
import { toast } from "sonner";

import { SelectMenu } from "@/components/common/SelectMenu";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useRepoStore } from "@/store/useRepoStore";
import { listRemotes } from "@/services/git";
import { toUserMessage } from "@/types/error";

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
  const commits = useRepoStore((state) => state.commits);
  const createTag = useRepoStore((state) => state.createTag);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [ref, setRef] = useState("");
  const [remote, setRemote] = useState<string | null>(null);
  const [push, setPush] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lockedRef = Boolean(fixedRef?.trim());

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
    setName("");
    setMessage("");
    setBusy(false);
    setError(null);
    setPush(true);
    setRef(fixedRef?.trim() ?? "");
  }, [open, fixedRef]);

  const refOptions = useMemo(
    () => [
      { value: "", label: t("repo.tagCurrentHead") },
      ...commits.map((commit) => ({
        value: commit.id,
        label: `${commit.shortId} · ${commit.subject}`,
      })),
    ],
    [commits, t],
  );

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
      <DialogContent className="max-w-md gap-4 p-5 sm:rounded-lg">
        <DialogHeader>
          <DialogTitle>{t("repo.createTagTitle")}</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(event) => void submit(event)}>
          {lockedRef ? (
            <div className="space-y-1.5">
              <p className="text-sm font-medium">{t("repo.tagBasedOn")}</p>
              <div className="border-border bg-muted/30 flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                {fixedRefIsTag ? (
                  <Tag className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
                ) : null}
                <span className="min-w-0 truncate font-mono">{fixedRef}</span>
              </div>
            </div>
          ) : (
            <label className="block space-y-1.5 text-sm font-medium">
              <span>{t("repo.tagBasedOn")}</span>
              <SelectMenu
                value={ref}
                options={refOptions}
                onChange={setRef}
                ariaLabel={t("repo.tagBasedOn")}
                disabled={busy}
              />
            </label>
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
