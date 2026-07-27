import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

import { DatePicker } from "@/components/common/DatePicker";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toUserMessage } from "@/types/error";
import {
  EMPTY_HISTORY_ADVANCED_FILTERS,
  hasActiveAdvancedGitFilters,
  isAdvancedDateRangeInvalid,
  isAdvancedPathSuspicious,
  type HistoryAdvancedFilters,
} from "@/utils/historyAdvancedFilters";

interface HistoryAdvancedFilterPopoverProps {
  applied: HistoryAdvancedFilters;
  showMergeCommitsPrefs: boolean;
  onShowMergeCommitsPrefsChange: (value: boolean) => void;
  onApply: (filters: HistoryAdvancedFilters) => Promise<void>;
  onReset: (showMergeCommits: boolean) => Promise<void>;
  disabled?: boolean;
}

/** 历史高级筛选：Popover 编辑 draft，应用后走 Git log */
export function HistoryAdvancedFilterPopover({
  applied,
  showMergeCommitsPrefs,
  onShowMergeCommitsPrefsChange,
  onApply,
  onReset,
  disabled = false,
}: HistoryAdvancedFilterPopoverProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<HistoryAdvancedFilters>(applied);
  const [prefsSnapshot, setPrefsSnapshot] = useState(showMergeCommitsPrefs);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setDraft({
      ...applied,
      showMergeCommits: showMergeCommitsPrefs,
    });
    setPrefsSnapshot(showMergeCommitsPrefs);
  }, [open, applied, showMergeCommitsPrefs]);

  const dateInvalid = isAdvancedDateRangeInvalid(draft);
  const pathInvalid = isAdvancedPathSuspicious(draft.path);
  const active = hasActiveAdvancedGitFilters(applied);

  async function handleApply(): Promise<void> {
    if (dateInvalid || pathInvalid || busy) {
      return;
    }
    setBusy(true);
    try {
      onShowMergeCommitsPrefsChange(draft.showMergeCommits);
      await onApply({ ...draft });
      setOpen(false);
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleReset(): Promise<void> {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      onShowMergeCommitsPrefsChange(prefsSnapshot);
      await onReset(prefsSnapshot);
      setDraft({
        ...EMPTY_HISTORY_ADVANCED_FILTERS,
        showMergeCommits: prefsSnapshot,
      });
      setOpen(false);
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled}
              className={cn(
                "text-muted-foreground absolute top-1/2 right-0.5 size-6 -translate-y-1/2",
                active && "text-primary",
              )}
              aria-label={t("repo.historyAdvancedFilter")}
            >
              <SlidersHorizontal className="size-3.5" aria-hidden="true" />
              {active ? (
                <span
                  className="bg-primary absolute top-0.5 right-0.5 size-1.5 rounded-full"
                  aria-hidden="true"
                />
              ) : null}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{t("repo.historyAdvancedFilter")}</TooltipContent>
      </Tooltip>

      <PopoverContent align="start" className="w-80 p-3">
        <div className="mb-3">
          <p className="text-sm font-medium">{t("repo.historyAdvancedFilter")}</p>
          <p className="text-muted-foreground text-xs">
            {t("repo.historyAdvancedHint")}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Field>
            <FieldLabel htmlFor="history-adv-grep" className="text-xs">
              {t("repo.historyAdvancedGrep")}
            </FieldLabel>
            <Input
              id="history-adv-grep"
              value={draft.grep}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, grep: event.target.value }))
              }
              placeholder={t("repo.historyAdvancedGrepPlaceholder")}
              className="h-8 text-xs"
              disabled={busy}
              autoComplete="off"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="history-adv-path" className="text-xs">
              {t("repo.historyAdvancedPath")}
            </FieldLabel>
            <Input
              id="history-adv-path"
              value={draft.path}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, path: event.target.value }))
              }
              placeholder={t("repo.historyAdvancedPathPlaceholder")}
              className="h-8 font-mono text-xs"
              disabled={busy}
              autoComplete="off"
              aria-invalid={pathInvalid || undefined}
            />
            {pathInvalid ? (
              <p className="text-destructive text-xs">
                {t("repo.historyAdvancedPathInvalid")}
              </p>
            ) : null}
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field>
              <FieldLabel htmlFor="history-adv-since" className="text-xs">
                {t("repo.historyAdvancedSince")}
              </FieldLabel>
              <DatePicker
                id="history-adv-since"
                value={draft.since}
                onChange={(since) =>
                  setDraft((prev) => ({
                    ...prev,
                    since,
                  }))
                }
                disabled={busy}
                aria-label={t("repo.historyAdvancedSince")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="history-adv-until" className="text-xs">
                {t("repo.historyAdvancedUntil")}
              </FieldLabel>
              <DatePicker
                id="history-adv-until"
                value={draft.until}
                onChange={(until) =>
                  setDraft((prev) => ({
                    ...prev,
                    until,
                  }))
                }
                disabled={busy}
                aria-label={t("repo.historyAdvancedUntil")}
              />
            </Field>
          </div>
          {dateInvalid ? (
            <p className="text-destructive text-xs">
              {t("repo.historyAdvancedDateInvalid")}
            </p>
          ) : null}

          <Field>
            <FieldLabel htmlFor="history-adv-author" className="text-xs">
              {t("repo.historyAdvancedAuthor")}
            </FieldLabel>
            <Input
              id="history-adv-author"
              value={draft.author}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, author: event.target.value }))
              }
              placeholder={t("repo.historyAdvancedAuthorPlaceholder")}
              className="h-8 text-xs"
              disabled={busy}
              autoComplete="off"
            />
          </Field>

          <div className="flex items-center justify-between gap-2">
            <FieldLabel
              htmlFor="history-adv-merges"
              className="text-xs font-normal"
            >
              {t("repo.historyAdvancedShowMerges")}
            </FieldLabel>
            <Switch
              id="history-adv-merges"
              checked={draft.showMergeCommits}
              onCheckedChange={(checked) =>
                setDraft((prev) => ({ ...prev, showMergeCommits: checked }))
              }
              disabled={busy}
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            disabled={busy}
            onClick={() => void handleReset()}
          >
            {t("repo.historyAdvancedReset")}
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8"
            disabled={busy || dateInvalid || pathInvalid}
            onClick={() => void handleApply()}
          >
            {t("repo.historyAdvancedApply")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
