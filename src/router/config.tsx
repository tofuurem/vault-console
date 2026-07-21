import type { RouteObject } from "react-router-dom";
import NotFound from "../pages/NotFound";
import LoginPage from "../pages/login/page";
import ExplorerPage from "../pages/explorer/page";
import AccessControlPage from "../pages/access-control/page";
import { HomeRoute, LoginRoute, RequireSession } from './RouteGuards';

const routes: RouteObject[] = [
  {
    path: "/",
    element: <HomeRoute />,
  },
  {
    path: "/login",
    element: <LoginRoute><LoginPage /></LoginRoute>,
  },
  {
    path: "/explorer",
    element: <RequireSession><ExplorerPage /></RequireSession>,
  },
  {
    path: "/access-control",
    element: <RequireSession accessControl><AccessControlPage /></RequireSession>,
  },
  {
    path: "*",
    element: <NotFound />,
  },
];

export default routes;
