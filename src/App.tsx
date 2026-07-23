import { BrowserRouter } from 'react-router-dom';
import { RuntimeConfigProvider } from './application/config/RuntimeConfigProvider';
import { VaultQueryProvider } from './application/query/VaultQueryProvider';
import type { KvV2Gateway, VaultAccessControlGateway, VaultAuthGateway } from './domain/vault/contracts';
import { AccessControlGatewayProvider } from './application/vault/AccessControlGatewayProvider';
import { KvV2GatewayProvider } from './application/vault/KvV2GatewayProvider';
import { VaultSessionProvider } from './application/vault/VaultSessionProvider';
import { AppRoutes } from './router';

interface AppProps {
  readonly authGateway?: VaultAuthGateway;
  readonly kvV2Gateway?: KvV2Gateway;
  readonly accessControlGateway?: VaultAccessControlGateway;
  readonly runtimeConfig?: Readonly<Record<string, unknown>>;
}

function App({ authGateway, kvV2Gateway, accessControlGateway, runtimeConfig }: AppProps) {
  return (
    <RuntimeConfigProvider config={runtimeConfig}>
      <AccessControlGatewayProvider gateway={accessControlGateway}>
        <KvV2GatewayProvider gateway={kvV2Gateway}>
          <VaultSessionProvider gateway={authGateway}>
            <VaultQueryProvider>
              <BrowserRouter basename={import.meta.env.BASE_URL}>
                <a href="#main-content" className="skip-link">Skip to main content</a>
                <AppRoutes />
              </BrowserRouter>
            </VaultQueryProvider>
          </VaultSessionProvider>
        </KvV2GatewayProvider>
      </AccessControlGatewayProvider>
    </RuntimeConfigProvider>
  );
}

export default App;
