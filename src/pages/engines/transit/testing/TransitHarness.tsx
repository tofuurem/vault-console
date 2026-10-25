import { useNavigate, useParams } from 'react-router-dom';

import type { TransitEngineGateway } from '@/domain/engines/transit/transit';
import { engineRoute } from '@/router/engine-route';
import TransitEnginePage from '../page';
import { TRANSIT_ENGINE } from './fake-transit-gateway';

/** Wires the page to the router the way `EnginesPage` does. */
export function TransitHarness({ gateway }: { readonly gateway: TransitEngineGateway }) {
  const subPath = useParams()['*'] ?? '';
  const navigate = useNavigate();
  return (
    <TransitEnginePage
      engine={TRANSIT_ENGINE}
      subPath={subPath}
      navigateTo={(path) => navigate(engineRoute(TRANSIT_ENGINE.path, path))}
      gateway={gateway}
    />
  );
}
