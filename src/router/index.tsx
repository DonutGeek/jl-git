import {
  createBrowserRouter,
  createRoutesFromElements,
  Route,
  RouterProvider,
} from "react-router-dom";

import { AppLayout } from "@/layouts/AppLayout";
import { BranchComparePage } from "@/pages/BranchComparePage";

const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route path="branch-compare" element={<BranchComparePage />} />
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
