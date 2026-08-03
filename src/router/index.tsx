import { lazy, Suspense } from "react";
import {
  createBrowserRouter,
  createRoutesFromElements,
  Route,
  RouterProvider,
} from "react-router-dom";

import { AppLoadingScreen } from "@/components/common/AppLoadingScreen";
import { AppLayout } from "@/layouts/AppLayout";

const BranchComparePage = lazy(() =>
  import("@/pages/BranchComparePage").then((module) => ({
    default: module.BranchComparePage,
  })),
);
const BranchHistoryPage = lazy(() =>
  import("@/pages/BranchHistoryPage").then((module) => ({
    default: module.BranchHistoryPage,
  })),
);
const BranchManagePage = lazy(() =>
  import("@/pages/BranchManagePage").then((module) => ({
    default: module.BranchManagePage,
  })),
);
const FileHistoryPage = lazy(() =>
  import("@/pages/FileHistoryPage").then((module) => ({
    default: module.FileHistoryPage,
  })),
);
const CommitHistoryPage = lazy(() =>
  import("@/pages/CommitHistoryPage").then((module) => ({
    default: module.CommitHistoryPage,
  })),
);
const MultiAgentPage = lazy(() =>
  import("@/pages/MultiAgentPage").then((module) => ({
    default: module.MultiAgentPage,
  })),
);
const ProjectManagePage = lazy(() =>
  import("@/pages/ProjectManagePage").then((module) => ({
    default: module.ProjectManagePage,
  })),
);

const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route path="branch-compare" element={<BranchComparePage />} />
      <Route path="file-history" element={<FileHistoryPage />} />
      <Route path="commit-history" element={<CommitHistoryPage />} />
      <Route path="branch-history" element={<BranchHistoryPage />} />
      <Route path="branch-manage" element={<BranchManagePage />} />
      <Route path="project-manage" element={<ProjectManagePage />} />
      <Route path="agent" element={<MultiAgentPage />} />
      {/* 兼容旧子窗路由 */}
      <Route path="jinglv" element={<MultiAgentPage />} />
      <Route path="resume-helper" element={<MultiAgentPage />} />
      <Route element={<AppLayout />}>
        <Route index element={null} />
        <Route path="tab/:tabId" element={null} />
        <Route path="repo/:projectId" element={null} />
      </Route>
    </>,
  ),
);

export function AppRouter() {
  return (
    <Suspense fallback={<AppLoadingScreen />}>
      <RouterProvider router={router} />
    </Suspense>
  );
}
