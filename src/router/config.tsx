import type { RouteObject } from "react-router-dom";
import AuthenticatedAppShell from '@/app/AuthenticatedAppShell';
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
    element: <RequireSession><AuthenticatedAppShell /></RequireSession>,
    children: [
      {
        path: '/explorer',
        element: <ExplorerPage />,
      },
      {
        path: '/explorer/:mount/*',
        element: <ExplorerPage />,
      },
      {
        path: '/access-control',
        element: <RequireSession accessControl><AccessControlPage /></RequireSession>,
      },
      {
        path: '/access-control/:section',
        element: <RequireSession accessControl><AccessControlPage /></RequireSession>,
      },
      {
        path: '/access-control/users/:username',
        element: <RequireSession accessControl><AccessControlPage /></RequireSession>,
      },
    ],
  },
  {
    path: "*",
    element: <NotFound />,
  },
];

export default routes;
