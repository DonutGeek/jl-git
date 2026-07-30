import { Spinner } from "@/components/ui/spinner";

import type {
  REPO_CHANGES_LOADING_AREAS,
  REPO_MAIN_LOADING_AREA,
} from "@/components/layout/repoLoadingLayout";

export type RepoLoadingArea =
  (typeof REPO_CHANGES_LOADING_AREAS)[number] | typeof REPO_MAIN_LOADING_AREA;

interface RepoLoadingIndicatorProps {
  area: RepoLoadingArea;
  label: string;
}

export function RepoLoadingIndicator({ area, label }: RepoLoadingIndicatorProps) {
  return (
    <div
      className="text-muted-foreground flex h-full min-h-0 items-center justify-center gap-2 text-xs"
      data-repo-loading-area={area}
    >
      <Spinner className="size-3.5" aria-label={label} />
      <span>{label}</span>
    </div>
  );
}
