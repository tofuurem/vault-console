import type { RouteObject } from "react-router-dom";
import NotFound from "../pages/NotFound";
import LoginPage from "../pages/login/page";
import ExplorerPage from "../pages/explorer/page";
import AccessControlPage from "../pages/access-control/page";

const routes: RouteObject[] = [
  {
    path: "/",
    element: <LoginPage />,
  },
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/explorer",
    element: <ExplorerPage />,
  },
  {
    path: "/access-control",
    element: <AccessControlPage />,
  },
  {
    path: "*",
    element: <NotFound />,
  },
];

export default routes;