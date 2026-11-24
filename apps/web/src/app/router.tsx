import { createBrowserRouter } from "react-router-dom";
import { HomePage } from "../pages/HomePage.tsx";
import { NotFoundPage } from "../pages/NotFoundPage.tsx";
import { AppLayout } from "./AppLayout.tsx";

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: "/", element: <HomePage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
