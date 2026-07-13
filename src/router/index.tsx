import {
  createBrowserRouter,
  createRoutesFromElements,
  Route,
  RouterProvider,
} from "react-router-dom";

import { AppLayout } from "@/layouts/AppLayout";
import { DashboardPage } from "@/pages/DashboardPage";
import { RepoPage } from "@/pages/RepoPage";

const router = createBrowserRouter(
  createRoutesFromElements(
    <Route element={<AppLayout />}>
      <Route index element={<DashboardPage />} />
      <Route path="repo/:projectId" element={<RepoPage />} />
    </Route>,
  ),
);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
