import { useState } from 'react';
import {
  createBrowserRouter,
  RouterProvider,
} from 'react-router-dom';
import { RuntimeConfigProvider } from './application/config/RuntimeConfigProvider';
import { ToastProvider } from './application/notifications/ToastProvider';
import { EnginesGatewayProvider } from './application/engines/EnginesGatewayProvider';
import { VaultQueryProvider } from './application/query/VaultQueryProvider';
import { ThemeProvider } from './application/theme/ThemeProvider';
import type {
  KvV2Gateway,
  VaultAccessControlGateway,
  VaultAuthGateway,
  VaultSealGateway,
} from './domain/vault/contracts';
import type { VaultWrappingGateway } from './domain/vault/wrapping';
import { AccessControlGatewayProvider } from './application/vault/AccessControlGatewayProvider';
import { KvV2GatewayProvider } from './application/vault/KvV2GatewayProvider';
import { SealGatewayProvider } from './application/vault/SealGatewayProvider';
import { VaultSessionProvider } from './application/vault/VaultSessionProvider';
import { WrappingGatewayProvider } from './application/vault/WrappingGatewayProvider';
import routes from './router/config';
import ToastViewport from './components/base/ToastViewport';
import type { SecretEnginesGateway, VaultApiGateway } from './domain/engines/engines';

interface AppProps {
  readonly authGateway?: VaultAuthGateway;
  readonly kvV2Gateway?: KvV2Gateway;
  readonly accessControlGateway?: VaultAccessControlGateway;
  readonly sealGateway?: VaultSealGateway;
  readonly wrappingGateway?: VaultWrappingGateway;
  readonly enginesGateway?: SecretEnginesGateway;
  readonly vaultApiGateway?: VaultApiGateway;
  readonly runtimeConfig?: Readonly<Record<string, unknown>>;
}

function App({
  authGateway,
  kvV2Gateway,
  accessControlGateway,
  sealGateway,
  wrappingGateway,
  enginesGateway,
  vaultApiGateway,
  runtimeConfig,
}: AppProps) {
  const [router] = useState(() => createBrowserRouter(routes, {
    basename: import.meta.env.BASE_URL,
  }));
  return (
    <ThemeProvider>
      <ToastProvider viewport={ToastViewport}>
        <RuntimeConfigProvider config={runtimeConfig}>
          <SealGatewayProvider gateway={sealGateway}>
            <WrappingGatewayProvider gateway={wrappingGateway}>
              <AccessControlGatewayProvider gateway={accessControlGateway}>
                <KvV2GatewayProvider gateway={kvV2Gateway}>
                  <VaultSessionProvider gateway={authGateway}>
                    <VaultQueryProvider>
                      <EnginesGatewayProvider engines={enginesGateway} api={vaultApiGateway}>
                        <RouterProvider router={router} />
                      </EnginesGatewayProvider>
                    </VaultQueryProvider>
                  </VaultSessionProvider>
                </KvV2GatewayProvider>
              </AccessControlGatewayProvider>
            </WrappingGatewayProvider>
          </SealGatewayProvider>
        </RuntimeConfigProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
