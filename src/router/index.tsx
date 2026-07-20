import {
  createBrowserRouter,
  createRoutesFromElements,
  Route,
  RouterProvider,
} from "react-router-dom";

import { AppLayout } from "@/layouts/AppLayout";
import { BranchComparePage } from "@/pages/BranchComparePage";
import { BranchHistoryPage } from "@/pages/BranchHistoryPage";
import { BranchManagePage } from "@/pages/BranchManagePage";
import { FileHistoryPage } from "@/pages/FileHistoryPage";
import { ResumeHelperPage } from "@/pages/ResumeHelperPage";

const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route path="branch-compare" element={<BranchComparePage />} />
      <Route path="file-history" element={<FileHistoryPage />} />
      <Route path="branch-history" element={<BranchHistoryPage />} />
      <Route path="branch-manage" element={<BranchManagePage />} />
      <Route path="resume-helper" element={<ResumeHelperPage />} />
      <Route element={<AppLayout />}>
        <Route index element={null} />
        <Route path="tab/:tabId" element={null} />
        <Route path="repo/:projectId" element={null} />
      </Route>
    </>,
  ),
);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
