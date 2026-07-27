import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { CompareBranchesAction } from "@/components/ai/AgentRichMessage";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getLog } from "@/services/git";
import { toUserMessage } from "@/types/error";
import type { GitCommitSummary } from "@/types/git";

interface AgentBranchComparisonDialogProps {
  action: CompareBranchesAction | null;
  open: boolean;
  repoPath: string;
  onOpenChange: (open: boolean) => void;
}

interface BranchComparison {
  baseOnly: GitCommitSummary[];
  targetOnly: GitCommitSummary[];
}

const COMMIT_LIMIT = 30;

/** Agent 触发的只读分支比较结果。 */
export function AgentBranchComparisonDialog({
  action,
  open,
  repoPath,
  onOpenChange,
}: AgentBranchComparisonDialogProps) {
  const { t } = useTranslation();
  const [comparison, setComparison] = useState<BranchComparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !action) {
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    setComparison(null);
    void Promise.all([
      getLog(repoPath, { ref: `${action.target}..${action.base}`, limit: COMMIT_LIMIT }),
      getLog(repoPath, { ref: `${action.base}..${action.target}`, limit: COMMIT_LIMIT }),
    ])
      .then(([baseOnly, targetOnly]) => {
        if (active) {
          setComparison({ baseOnly: baseOnly.commits, targetOnly: targetOnly.commits });
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(toUserMessage(reason) || t("agent.compareBranchesFailed"));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [action, open, repoPath, t]);

  if (!action) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-4 p-5 sm:rounded-lg">
        <DialogHeader>
          <DialogTitle>
            {t("agent.compareBranchesTitle", { base: action.base, target: action.target })}
          </DialogTitle>
          <DialogDescription>{t("agent.compareBranchesDescription")}</DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="text-muted-foreground text-sm">{t("agent.compareBranchesLoading")}</p>
        ) : null}
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        {comparison ? (
          <div className="grid min-h-0 gap-4 md:grid-cols-2">
            <CommitColumn
              title={t("agent.commitsOnlyOn", { branch: action.base })}
              commits={comparison.baseOnly}
            />
            <CommitColumn
              title={t("agent.commitsOnlyOn", { branch: action.target })}
              commits={comparison.targetOnly}
            />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function CommitColumn({ title, commits }: { title: string; commits: readonly GitCommitSummary[] }) {
  const { t } = useTranslation();
  return (
    <section className="min-w-0 rounded-md border">
      <h3 className="border-b px-3 py-2 text-sm font-medium">{title}</h3>
      <ScrollArea className="h-72">
        {commits.length > 0 ? (
          <ul className="divide-y">
            {commits.map((commit) => (
              <li key={commit.id} className="px-3 py-2 text-xs">
                <p className="font-mono text-muted-foreground">{commit.shortId}</p>
                <p className="mt-0.5 wrap-break-word">{commit.subject}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground px-3 py-4 text-xs">{t("agent.noUniqueCommits")}</p>
        )}
      </ScrollArea>
    </section>
  );
}
