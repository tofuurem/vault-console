import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { vi } from 'vitest';

import { EnginesGatewayContext } from '@/application/engines/EnginesGatewayContext';
import { ToastProvider } from '@/application/notifications/ToastProvider';
import { VaultSessionContext, type VaultSessionContextValue } from '@/application/vault/VaultSessionContext';
import ToastViewport from '@/components/base/ToastViewport';
import {
  engineKind,
  type SecretEngine,
  type SecretEnginesGateway,
  type VaultApiGateway,
} from '@/domain/engines/engines';
import { vaultSessionContextValue } from './vault-session-context';

export function testEngine(path: string, type: string, overrides: Partial<SecretEngine> = {}): SecretEngine {
  return {
    path,
    type,
    kind: engineKind(type, type === 'kv' ? { version: '2' } : {}),
    description: '',
    accessor: `${type}_${path.replace(/\W/g, '')}`,
    ...overrides,
  };
}

export function fakeEnginesGateway(engines: readonly SecretEngine[] = []): SecretEnginesGateway {
  return {
    listEngines: vi.fn(async () => engines),
    enableEngine: vi.fn(async () => undefined),
    readTune: vi.fn(async () => ({ description: '', defaultLeaseTtlSeconds: 0, maxLeaseTtlSeconds: 0 })),
    tuneEngine: vi.fn(async () => undefined),
    disableEngine: vi.fn(async () => undefined),
  };
}

export function fakeVaultApi(overrides: Partial<VaultApiGateway> = {}): VaultApiGateway {
  return {
    list: vi.fn(async () => []),
    read: vi.fn(async () => null),
    write: vi.fn(async () => null),
    remove: vi.fn(async () => undefined),
    ...overrides,
  };
}

function CurrentLocation() {
  const location = useLocation();
  return <output aria-label="Current location">{location.pathname}</output>;
}

interface RenderEngineOptions {
  readonly engines?: SecretEnginesGateway;
  readonly api?: VaultApiGateway;
  readonly vault?: VaultSessionContextValue;
  /** Initial URL, e.g. `/engines/transit/keys`. */
  readonly url?: string;
  /** Route pattern the element is mounted under. */
  readonly route?: string;
}

/**
 * Renders engine UI with query, session, toast, gateway, and router context.
 * Engine workspaces that own their own gateway provider can wrap `ui` in it.
 */
export function renderWithEngines(ui: ReactNode, {
  engines = fakeEnginesGateway(),
  api = fakeVaultApi(),
  vault = vaultSessionContextValue(),
  url = '/',
  route = '*',
}: RenderEngineOptions = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const result = render(
    <QueryClientProvider client={client}>
      <VaultSessionContext.Provider value={vault}>
        <EnginesGatewayContext.Provider value={{ engines, api }}>
          <ToastProvider viewport={ToastViewport}>
            <MemoryRouter initialEntries={[url]}>
              <Routes>
                <Route path={route} element={ui} />
              </Routes>
              <CurrentLocation />
            </MemoryRouter>
          </ToastProvider>
        </EnginesGatewayContext.Provider>
      </VaultSessionContext.Provider>
    </QueryClientProvider>,
  );
  return { ...result, client, engines, api };
}
