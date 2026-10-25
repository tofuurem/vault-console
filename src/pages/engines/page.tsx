import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';

import { useSecretEngines } from '@/application/engines/useSecretEngines';
import ContentSkeleton from '@/components/base/ContentSkeleton';
import type { EngineKind } from '@/domain/engines/engines';
import { normalizeVaultError } from '@/domain/vault/errors';
import { engineRoute, resolveEngineRoute } from '@/router/engine-route';
import { explorerRoute } from '@/router/explorer-route';
import GenericEngineBrowser from './components/GenericEngineBrowser';
import type { EnginePageProps } from './engine-page';

type EnginePage = LazyExoticComponent<ComponentType<EnginePageProps>>;

/** Dedicated workspaces by engine kind; anything missing uses the generic browser. */
const ENGINE_PAGES: Partial<Record<EngineKind, EnginePage>> = {
  database: lazy(() => import('./database/page')),
  transit: lazy(() => import('./transit/page')),
  pki: lazy(() => import('./pki/page')),
  ssh: lazy(() => import('./ssh/page')),
};

function EngineMessage({ title, message }: { readonly title: string; readonly message: string }) {
  return (
    <main id="main-content" tabIndex={-1} className="flex min-h-0 flex-1 items-center justify-center bg-background-50 p-6">
      <div className="max-w-md text-center">
        <i className="ri-instance-line text-2xl text-foreground-400" aria-hidden="true" />
        <h1 className="mt-2 text-sm font-semibold text-foreground-900">{title}</h1>
        <p className="mt-1 text-xs leading-5 text-foreground-600">{message}</p>
        <Link to="/home" className="mt-4 inline-flex min-h-11 items-center rounded-md px-3 text-xs font-medium text-primary-700 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 sm:min-h-8">
          Back to overview
        </Link>
      </div>
    </main>
  );
}

const loading = (
  <main id="main-content" aria-busy="true" className="flex min-h-0 flex-1 bg-background-50">
    <ContentSkeleton label="Loading engine" />
  </main>
);

export default function EnginesPage() {
  const splat = useParams()['*'] ?? '';
  const navigate = useNavigate();
  const engines = useSecretEngines();

  if (engines.isPending) return loading;
  if (engines.isError) {
    return <EngineMessage title="Engines could not be listed" message={normalizeVaultError(engines.error).message} />;
  }
  const route = resolveEngineRoute(splat, engines.data.map((engine) => engine.path));
  const engine = route && engines.data.find((candidate) => candidate.path === route.mount);
  if (!route || !engine) {
    return (
      <EngineMessage
        title="Engine not found"
        message="No secrets engine visible to this token is mounted at this path. It may have been disabled."
      />
    );
  }
  if (engine.kind === 'kv-v2') return <Navigate to={explorerRoute(engine.path, route.subPath)} replace />;

  const Page = ENGINE_PAGES[engine.kind];
  const props: EnginePageProps = {
    engine,
    subPath: route.subPath,
    navigateTo: (subPath) => navigate(engineRoute(engine.path, subPath)),
  };
  if (!Page) return <GenericEngineBrowser key={engine.path} {...props} />;
  return (
    <Suspense fallback={loading}>
      <Page key={engine.path} {...props} />
    </Suspense>
  );
}
