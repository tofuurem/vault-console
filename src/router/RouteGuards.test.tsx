import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import {
  VaultSessionContext,
  type VaultSessionContextValue,
} from '@/application/vault/VaultSessionContext';
import { vaultToken } from '@/domain/vault/sensitive-value';
import { RequireSession } from './RouteGuards';

function context(overrides: Partial<VaultSessionContextValue> = {}): VaultSessionContextValue {
  return {
    status: 'anonymous',
    capabilities: {},
    capabilityDiscovery: 'idle',
    accessControlPermission: {
      state: 'denied',
      reason: 'Vault policy does not allow access-control discovery.',
    },
    sessionPersistenceAvailable: true,
    checkHealth: vi.fn(),
    queryCapabilities: vi.fn(),
    permissionFor: vi.fn(() => ({ state: 'unknown' as const, reason: 'Not queried.' })),
    signInWithToken: vi.fn(),
    signInWithUserpass: vi.fn(),
    expireSession: vi.fn(),
    signOut: vi.fn(),
    ...overrides,
  };
}

function GuardHarness({ value, accessControl = false }: { value: VaultSessionContextValue; accessControl?: boolean }) {
  return (
    <VaultSessionContext.Provider value={value}>
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route path="/login" element={<h1>Login route</h1>} />
          <Route path="/explorer" element={<h1>Explorer route</h1>} />
          <Route
            path="/protected"
            element={<RequireSession accessControl={accessControl}><h1>Protected route</h1></RequireSession>}
          />
        </Routes>
      </MemoryRouter>
    </VaultSessionContext.Provider>
  );
}

describe('RouteGuards', () => {
  it('waits for a persisted session to finish restoring', () => {
    render(<GuardHarness value={context({ status: 'restoring' })} />);
    expect(screen.getByText('Restoring Vault session…')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Login route' })).not.toBeInTheDocument();
  });

  it('redirects anonymous sessions to login', () => {
    render(<GuardHarness value={context()} />);
    expect(screen.getByRole('heading', { name: 'Login route' })).toBeVisible();
  });

  it('keeps non-admin sessions out of access control', () => {
    render(
      <GuardHarness
        accessControl
        value={context({
          status: 'authenticated',
          session: {
            serverUrl: 'https://vault.example.test',
            token: vaultToken('hvs.reader'),
            authMethod: 'token',
          },
        })}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Explorer route' })).toBeVisible();
  });

  it('renders access control for a session with discovered capabilities', () => {
    render(
      <GuardHarness
        accessControl
        value={context({
          status: 'authenticated',
          capabilityDiscovery: 'ready',
          accessControlPermission: { state: 'allowed' },
          session: {
            serverUrl: 'https://vault.example.test',
            token: vaultToken('hvs.admin'),
            authMethod: 'token',
          },
        })}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Protected route' })).toBeVisible();
  });

  it('lets Vault resource requests decide when capability discovery is unavailable', () => {
    render(
      <GuardHarness
        accessControl
        value={context({
          status: 'authenticated',
          capabilityDiscovery: 'unavailable',
          accessControlPermission: {
            state: 'unknown',
            reason: 'Vault capability discovery is unavailable for this token.',
          },
          session: {
            serverUrl: 'https://vault.example.test',
            token: vaultToken('hvs.unknown'),
            authMethod: 'token',
          },
        })}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Protected route' })).toBeVisible();
  });
});
