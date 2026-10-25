import { DatabaseGatewayProvider } from '@/application/engines/database/DatabaseGatewayProvider';
import type { DatabaseEngineGateway } from '@/domain/engines/database/database';
import type { EnginePageProps } from '../engine-page';
import DatabaseWorkspace from './components/DatabaseWorkspace';

interface DatabaseEnginePageProps extends EnginePageProps {
  /** Replaces the Vault adapter, for tests. */
  readonly gateway?: DatabaseEngineGateway;
}

/** Workspace for the database secrets engine: connections, roles, and static roles. */
export default function DatabaseEnginePage({ gateway, ...props }: DatabaseEnginePageProps) {
  return (
    <DatabaseGatewayProvider gateway={gateway}>
      <DatabaseWorkspace {...props} />
    </DatabaseGatewayProvider>
  );
}
