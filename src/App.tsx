import { useState } from 'react';
import {
  createBrowserRouter,
  RouterProvider,
} from 'react-router-dom';
import { RuntimeConfigProvider } from './application/config/RuntimeConfigProvider';
import { ToastProvider } from './application/notifications/ToastProvider';
import { VaultQueryProvider } from './application/query/VaultQueryProvider';
import { ThemeProvider } from './application/theme/ThemeProvider';
import type {
  KvV2Gateway,
  VaultAccessControlGateway,
  VaultAuthGateway,
  VaultSealGateway,
} from './domain/vault/contracts';
import { AccessControlGatewayProvider } from './application/vault/AccessControlGatewayProvider';
import { KvV2GatewayProvider } from './application/vault/KvV2GatewayProvider';
import { SealGatewayProvider } from './application/vault/SealGatewayProvider';
import { VaultSessionProvider } from './application/vault/VaultSessionProvider';
import routes from './router/config';

interface AppProps {
  readonly authGateway?: VaultAuthGateway;
  readonly kvV2Gateway?: KvV2Gateway;
  readonly accessControlGateway?: VaultAccessControlGateway;
  readonly sealGateway?: VaultSealGateway;
  readonly runtimeConfig?: Readonly<Record<string, unknown>>;
}

function App({
  authGateway,
  kvV2Gateway,
  accessControlGateway,
  sealGateway,
  runtimeConfig,
}: AppProps) {
  const [router] = useState(() => createBrowserRouter(routes, {
    basename: import.meta.env.BASE_URL,
  }));
  return (
    <ThemeProvider>
      <ToastProvider>
        <RuntimeConfigProvider config={runtimeConfig}>
          <SealGatewayProvider gateway={sealGateway}>
            <AccessControlGatewayProvider gateway={accessControlGateway}>
              <KvV2GatewayProvider gateway={kvV2Gateway}>
                <VaultSessionProvider gateway={authGateway}>
                  <VaultQueryProvider>
                    <RouterProvider router={router} />
                  </VaultQueryProvider>
                </VaultSessionProvider>
              </KvV2GatewayProvider>
            </AccessControlGatewayProvider>
          </SealGatewayProvider>
        </RuntimeConfigProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
