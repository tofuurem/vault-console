import { TransitGatewayProvider } from '@/application/engines/transit/TransitGatewayProvider';
import type { TransitEngineGateway } from '@/domain/engines/transit/transit';
import type { EnginePageProps } from '../engine-page';
import TransitWorkspace from './components/TransitWorkspace';

interface TransitEnginePageProps extends EnginePageProps {
  /** Replaces the Vault adapter, e.g. with a fake in tests. */
  readonly gateway?: TransitEngineGateway;
}

/** Transit workspace: keys, their versions and settings, a per-key operations workbench, and mount tools. */
export default function TransitEnginePage({ gateway, ...props }: TransitEnginePageProps) {
  return (
    <TransitGatewayProvider gateway={gateway}>
      <TransitWorkspace {...props} />
    </TransitGatewayProvider>
  );
}
