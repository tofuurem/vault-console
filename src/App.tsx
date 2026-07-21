import { BrowserRouter } from 'react-router-dom';
import type { KvV2Gateway, VaultAccessControlGateway, VaultAuthGateway } from './domain/vault/contracts';
import { AccessControlGatewayProvider } from './application/vault/AccessControlGatewayProvider';
import { KvV2GatewayProvider } from './application/vault/KvV2GatewayProvider';
import { VaultSessionProvider } from './application/vault/VaultSessionProvider';
import { AppRoutes } from './router';

interface AppProps {
  readonly authGateway?: VaultAuthGateway;
  readonly kvV2Gateway?: KvV2Gateway;
  readonly accessControlGateway?: VaultAccessControlGateway;
}

function App({ authGateway, kvV2Gateway, accessControlGateway }: AppProps) {
  return (
    <AccessControlGatewayProvider gateway={accessControlGateway}>
      <KvV2GatewayProvider gateway={kvV2Gateway}>
        <VaultSessionProvider gateway={authGateway}>
          <BrowserRouter basename={import.meta.env.BASE_URL}>
            <AppRoutes />
          </BrowserRouter>
        </VaultSessionProvider>
      </KvV2GatewayProvider>
    </AccessControlGatewayProvider>
  );
}

export default App;
