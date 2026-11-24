import { createBrowserRouter } from "react-router-dom";
import { ClipEditorPage } from "../pages/ClipEditorPage.tsx";
import { HomePage } from "../pages/HomePage.tsx";
import { JobPage } from "../pages/JobPage.tsx";
import { NotFoundPage } from "../pages/NotFoundPage.tsx";
import { ToolsPage } from "../pages/ToolsPage.tsx";
import { BrandPage } from "../pages/BrandPage.tsx";
import { AppLayout } from "./AppLayout.tsx";

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: "/", element: <HomePage /> },
      { path: "/tools", element: <ToolsPage /> },
      { path: "/brand", element: <BrandPage /> },
      { path: "/jobs/:jobId", element: <JobPage /> },
      { path: "/jobs/:jobId/clips/:clipId", element: <ClipEditorPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
