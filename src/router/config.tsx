import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';

import AuthenticatedAppShell from '@/app/AuthenticatedAppShell';
import NotFound from '@/pages/NotFound';
import LoginPage from '@/pages/login/page';
import ApplicationRouteBoundary from './ApplicationRouteBoundary';
import { HomeRoute, LoginRoute, RequireSession } from './RouteGuards';
import LazyRoute from './LazyRoute';

const ExplorerPage = lazy(() => import('@/pages/explorer/page'));
const AccessControlPage = lazy(() => import('@/pages/access-control/page'));
const UnsealPage = lazy(() => import('@/pages/unseal/page'));
const ActivityPage = lazy(() => import('@/pages/activity/page'));
const HomePage = lazy(() => import('@/pages/home/page'));
const UnwrapPage = lazy(() => import('@/pages/unwrap/page'));
const EnginesPage = lazy(() => import('@/pages/engines/page'));

const applicationRoutes: RouteObject[] = [
  {
    path: "/",
    element: <HomeRoute />,
  },
  {
    path: "/login",
    element: <LoginRoute><LoginPage /></LoginRoute>,
  },
  {
    path: '/unseal',
    element: <LazyRoute><UnsealPage /></LazyRoute>,
  },
  {
    path: '/unwrap',
    element: <LazyRoute><UnwrapPage /></LazyRoute>,
  },
  {
    element: <RequireSession><AuthenticatedAppShell /></RequireSession>,
    children: [
      {
        path: '/explorer',
        element: <LazyRoute><ExplorerPage /></LazyRoute>,
      },
      {
        path: '/explorer/:mount/*',
        element: <LazyRoute><ExplorerPage /></LazyRoute>,
      },
      {
        path: '/home',
        element: <LazyRoute><HomePage /></LazyRoute>,
      },
      {
        path: '/engines/*',
        element: <LazyRoute><EnginesPage /></LazyRoute>,
      },
      {
        path: '/activity',
        element: <LazyRoute><ActivityPage /></LazyRoute>,
      },
      {
        path: '/access-control',
        element: <RequireSession accessControl><LazyRoute><AccessControlPage /></LazyRoute></RequireSession>,
      },
      {
        path: '/access-control/:section',
        element: <RequireSession accessControl><LazyRoute><AccessControlPage /></LazyRoute></RequireSession>,
      },
      {
        path: '/access-control/users/:username',
        element: <RequireSession accessControl><LazyRoute><AccessControlPage /></LazyRoute></RequireSession>,
      },
      {
        path: '/access-control/users/:username/:action',
        element: <RequireSession accessControl><LazyRoute><AccessControlPage /></LazyRoute></RequireSession>,
      },
      {
        path: '/access-control/groups/:groupId',
        element: <RequireSession accessControl><LazyRoute><AccessControlPage /></LazyRoute></RequireSession>,
      },
      {
        path: '/access-control/groups/:groupId/:action',
        element: <RequireSession accessControl><LazyRoute><AccessControlPage /></LazyRoute></RequireSession>,
      },
      {
        path: '/access-control/roles/:roleName',
        element: <RequireSession accessControl><LazyRoute><AccessControlPage /></LazyRoute></RequireSession>,
      },
      {
        path: '/access-control/roles/:roleName/:action',
        element: <RequireSession accessControl><LazyRoute><AccessControlPage /></LazyRoute></RequireSession>,
      },
      {
        path: '/access-control/removed-identities/:entityId',
        element: <RequireSession accessControl><LazyRoute><AccessControlPage /></LazyRoute></RequireSession>,
      },
    ],
  },
  {
    path: "*",
    element: <NotFound />,
  },
];

const routes: RouteObject[] = [{
  element: <ApplicationRouteBoundary />,
  children: applicationRoutes,
}];

export default routes;
