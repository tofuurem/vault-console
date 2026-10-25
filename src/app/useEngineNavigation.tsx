import { useCallback, useMemo, useState } from 'react';
import { matchPath, useLocation, useNavigate } from 'react-router-dom';

import { useSecretEngines } from '@/application/engines/useSecretEngines';
import EnableEngineDialog from '@/components/feature/EnableEngineDialog';
import { engineRoute, resolveEngineRoute } from '@/router/engine-route';
import { explorerRoute } from '@/router/explorer-route';

const NO_ENGINES = [] as const;

/** Sidebar state for non-KV secrets engines plus the enable-engine dialog. */
export function useEngineNavigation(refreshMounts: () => void) {
  const location = useLocation();
  const navigate = useNavigate();
  const [enableOpen, setEnableOpen] = useState(false);
  const query = useSecretEngines();
  const allEngines = query.data ?? NO_ENGINES;
  const engines = useMemo(() => allEngines.filter((engine) => engine.kind !== 'kv-v2'), [allEngines]);
  const openEnable = useCallback(() => setEnableOpen(true), []);
  const match = matchPath('/engines/*', location.pathname);
  const activeEngine = match
    ? resolveEngineRoute(match.params['*'] ?? '', engines.map((engine) => engine.path))?.mount ?? ''
    : '';
  const dialog = (
    <EnableEngineDialog
      open={enableOpen}
      existingPaths={allEngines.map((engine) => engine.path)}
      onClose={() => setEnableOpen(false)}
      onEnabled={(path, kind) => {
        setEnableOpen(false);
        refreshMounts();
        navigate(kind === 'kv-v2' ? explorerRoute(path) : engineRoute(path));
      }}
    />
  );
  return {
    engines,
    loaded: query.isSuccess,
    activeEngine,
    openEnable,
    selectEngine: (path: string) => navigate(engineRoute(path)),
    dialog,
  };
}
