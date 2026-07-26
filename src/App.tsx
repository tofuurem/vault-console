import { useState } from 'react';
import {
  createBrowserRouter,
  RouterProvider,
} from 'react-router-dom';
import { RuntimeConfigProvider } from './application/config/RuntimeConfigProvider';
import { ToastProvider } from './application/notifications/ToastProvider';
import { VaultQueryProvider } from './application/query/VaultQueryProvider';
import { ThemeProvider } from './application/theme/ThemeProvider';
import type { KvV2Gateway, VaultAccessControlGateway, VaultAuthGateway } from './domain/vault/contracts';
import { AccessControlGatewayProvider } from './application/vault/AccessControlGatewayProvider';
import { KvV2GatewayProvider } from './application/vault/KvV2GatewayProvider';
import { VaultSessionProvider } from './application/vault/VaultSessionProvider';
import routes from './router/config';

interface AppProps {
  readonly authGateway?: VaultAuthGateway;
  readonly kvV2Gateway?: KvV2Gateway;
  readonly accessControlGateway?: VaultAccessControlGateway;
  readonly runtimeConfig?: Readonly<Record<string, unknown>>;
}

function App({ authGateway, kvV2Gateway, accessControlGateway, runtimeConfig }: AppProps) {
  const [router] = useState(() => createBrowserRouter(routes, {
    basename: import.meta.env.BASE_URL,
  }));
  return (
    <ThemeProvider>
      <ToastProvider>
        <RuntimeConfigProvider config={runtimeConfig}>
          <AccessControlGatewayProvider gateway={accessControlGateway}>
            <KvV2GatewayProvider gateway={kvV2Gateway}>
              <VaultSessionProvider gateway={authGateway}>
                <VaultQueryProvider>
                  <RouterProvider router={router} />
                </VaultQueryProvider>
              </VaultSessionProvider>
            </KvV2GatewayProvider>
          </AccessControlGatewayProvider>
        </RuntimeConfigProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
