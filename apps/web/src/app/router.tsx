import { createBrowserRouter } from "react-router-dom";
import { HomePage } from "../pages/HomePage.tsx";
import { JobPage } from "../pages/JobPage.tsx";
import { NotFoundPage } from "../pages/NotFoundPage.tsx";
import { ToolsPage } from "../pages/ToolsPage.tsx";
import { AppLayout } from "./AppLayout.tsx";

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: "/", element: <HomePage /> },
      { path: "/tools", element: <ToolsPage /> },
      { path: "/jobs/:jobId", element: <JobPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
