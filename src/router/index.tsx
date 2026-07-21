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
import { JinglvPage } from "@/pages/JinglvPage";

const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route path="branch-compare" element={<BranchComparePage />} />
      <Route path="file-history" element={<FileHistoryPage />} />
      <Route path="branch-history" element={<BranchHistoryPage />} />
      <Route path="branch-manage" element={<BranchManagePage />} />
      <Route path="jinglv" element={<JinglvPage />} />
      {/* 兼容旧子窗路由 */}
      <Route path="resume-helper" element={<JinglvPage />} />
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
