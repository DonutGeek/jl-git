import { useEffect, useState } from "react";

import { RepoTabBar } from "@/components/layout/RepoTabBar";
import { RecentProjectList } from "@/components/project/RecentProjectList";

import { useOpenTabsStore } from "@/store/useOpenTabsStore";
import { useProjectStore } from "@/store/useProjectStore";

import { toUserMessage } from "@/types/error";

export function DashboardPage() {
  const loadProjects = useProjectStore((state) => state.loadProjects);
  const loadRecent = useProjectStore((state) => state.loadRecent);
  const openTab = useOpenTabsStore((state) => state.openTab);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadDashboard(): Promise<void> {
      try {
        await Promise.all([loadProjects(), loadRecent()]);
        if (isMounted) {
          setError(null);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(toUserMessage(loadError));
        }
      }
    }

    void loadDashboard();

    return () => {
      isMounted = false;
    };
  }, [loadProjects, loadRecent]);

  return (
    <div className="bg-background flex h-full flex-col overflow-hidden">
      <RepoTabBar />

      <main className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-6 pt-6">
        {error ? (
          <p className="text-destructive mb-4 text-sm" role="alert">
            {error}
          </p>
        ) : null}

        <RecentProjectList
          onOpened={(projectId) => {
            openTab(projectId);
          }}
        />
      </main>
    </div>
  );
}
