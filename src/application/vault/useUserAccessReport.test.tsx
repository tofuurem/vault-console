import { QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createVaultQueryClient } from '@/application/query/query-client';
import type {
  VaultAccessControlGateway,
  VaultSession,
} from '@/domain/vault/contracts';
import { VaultError } from '@/domain/vault/errors';
import { vaultToken } from '@/domain/vault/sensitive-value';
import { AccessControlGatewayContext } from './AccessControlGatewayContext';
import {
  useUserAccessReport,
  type UserAccessAccountRef,
} from './useUserAccessReport';

const session: VaultSession = {
  serverUrl: 'https://vault.example.test',
  token: vaultToken('hvs.reader'),
  authMethod: 'token',
};

const account: UserAccessAccountRef = {
  username: 'alice',
  mount: 'userpass',
  mountAccessor: 'auth_userpass_123',
};

function policyHcl(path: string): string {
  return `path "${path}" {\n  capabilities = ["read"]\n}`;
}

function gateway(): VaultAccessControlGateway {
  return {
    listAuthMounts: vi.fn(),
    listPolicies: vi.fn(),
    readPolicy: vi.fn(async (_session, name) => ({
      name,
      policy: policyHcl(`applications/data/${name}`),
    })),
    writePolicy: vi.fn(),
    deletePolicy: vi.fn(),
    listGroups: vi.fn(async () => [{
      id: 'group-platform',
      name: 'platform-team',
      policies: ['vc-role-platform-readers'],
      memberEntityIds: ['entity-alice'],
      memberGroupIds: [],
      metadata: {},
    }]),
    readGroup: vi.fn(),
    createGroup: vi.fn(),
    updateGroup: vi.fn(),
    deleteGroup: vi.fn(),
    updateGroupMembers: vi.fn(),
    listUserpassAccounts: vi.fn(),
    readUserpassAccount: vi.fn(async (_session, mount, username) => ({
      mount,
      username,
      tokenPolicies: ['vc-user-alice'],
    })),
    createUserpassAccount: vi.fn(),
    updateUserpassPolicies: vi.fn(),
    resetUserpassPassword: vi.fn(),
    deleteUserpassAccount: vi.fn(),
    readEntityByName: vi.fn(),
    lookupEntityByAlias: vi.fn(async () => ({
      id: 'entity-alice',
      name: 'Alice Operator',
      disabled: false,
      policies: ['legacy-audit'],
      groupIds: [],
      aliases: [{
        id: 'alias-alice',
        name: 'alice',
        canonicalId: 'entity-alice',
        mountAccessor: 'auth_userpass_123',
      }],
    })),
    createEntity: vi.fn(),
    updateEntity: vi.fn(),
    deleteEntity: vi.fn(),
    createEntityAlias: vi.fn(),
    deleteEntityAlias: vi.fn(),
    getCapabilities: vi.fn(),
  };
}

function ReportProbe({
  selectedAccount,
}: {
  readonly selectedAccount?: UserAccessAccountRef;
}) {
  const result = useUserAccessReport(session, selectedAccount, ['applications']);
  const data = result.state.data;
  const report = data?.kind === 'report' ? data.report : undefined;
  const user = data?.kind === 'report' ? data.user : undefined;
  return (
    <div>
      <output data-testid="state">{result.state.status}</output>
      <output data-testid="kind">{data?.kind ?? 'none'}</output>
      <output data-testid="completeness">{report?.completeness.state ?? 'none'}</output>
      <output data-testid="targets">{report?.targets.map((target) => target.path).join(',') ?? ''}</output>
      <output data-testid="groups">{report?.groups.map((group) => group.name).join(',') ?? ''}</output>
      <output data-testid="user">{user?.displayName ?? ''}</output>
      <output data-testid="unresolved">{report?.unresolvedSources.map((source) => `${source.policyName}:${source.reason}`).join(',') ?? ''}</output>
      <button
        type="button"
        onClick={() => result.actions.retryPolicy('vc-user-broken')}
      >
        Retry broken policy
      </button>
    </div>
  );
}

function renderProbe(
  accessGateway: VaultAccessControlGateway,
  selectedAccount: UserAccessAccountRef | undefined,
) {
  const view = render(
    <QueryClientProvider client={createVaultQueryClient()}>
      <AccessControlGatewayContext.Provider value={accessGateway}>
        <ReportProbe selectedAccount={selectedAccount} />
      </AccessControlGatewayContext.Provider>
    </QueryClientProvider>,
  );
  return {
    ...view,
    rerenderAccount(nextAccount: UserAccessAccountRef | undefined) {
      view.rerender(
        <QueryClientProvider client={createVaultQueryClient()}>
          <AccessControlGatewayContext.Provider value={accessGateway}>
            <ReportProbe selectedAccount={nextAccount} />
          </AccessControlGatewayContext.Provider>
        </QueryClientProvider>,
      );
    },
  };
}

describe('useUserAccessReport', () => {
  it('stays idle without a selected account and reads only attached policies on demand', async () => {
    const access = gateway();
    const idleView = renderProbe(access, undefined);

    expect(screen.getByTestId('state')).toHaveTextContent('idle');
    expect(access.readUserpassAccount).not.toHaveBeenCalled();
    expect(access.lookupEntityByAlias).not.toHaveBeenCalled();
    expect(access.listGroups).not.toHaveBeenCalled();
    expect(access.readPolicy).not.toHaveBeenCalled();

    idleView.unmount();
    renderProbe(access, account);

    await waitFor(() => expect(screen.getByTestId('kind')).toHaveTextContent('report'));
    expect(access.readUserpassAccount).toHaveBeenCalledWith(
      session,
      'userpass',
      'alice',
      expect.any(AbortSignal),
    );
    expect(access.lookupEntityByAlias).toHaveBeenCalledOnce();
    expect(access.listGroups).toHaveBeenCalledOnce();
    expect(access.listPolicies).not.toHaveBeenCalled();
    expect(access.readPolicy).toHaveBeenCalledTimes(3);
    expect(vi.mocked(access.readPolicy).mock.calls.map((call) => call[1]).sort()).toEqual([
      'legacy-audit',
      'vc-role-platform-readers',
      'vc-user-alice',
    ]);
    expect(screen.getByTestId('groups')).toHaveTextContent('platform-team');
  });

  it('keeps direct managed access when groups are forbidden', async () => {
    const access = gateway();
    access.listGroups = vi.fn(async () => {
      throw new VaultError('authorization', { status: 403 });
    });

    renderProbe(access, account);

    await waitFor(() => expect(screen.getByTestId('kind')).toHaveTextContent('report'));
    expect(screen.getByTestId('completeness')).toHaveTextContent('limited-by-policy');
    expect(screen.getByTestId('targets')).toHaveTextContent('vc-user-alice');
    expect(screen.getByTestId('groups')).toBeEmptyDOMElement();
  });

  it('keeps the userpass account when identity lookup is forbidden', async () => {
    const access = gateway();
    access.lookupEntityByAlias = vi.fn(async () => {
      throw new VaultError('authorization', { status: 403 });
    });
    access.listGroups = vi.fn(async () => []);

    renderProbe(access, account);

    await waitFor(() => expect(screen.getByTestId('kind')).toHaveTextContent('report'));
    expect(screen.getByTestId('user')).toHaveTextContent('alice');
    expect(screen.getByTestId('completeness')).toHaveTextContent('limited-by-policy');
    expect(screen.getByTestId('targets')).toHaveTextContent('vc-user-alice');
  });

  it('preserves readable policy targets and retries only one denied policy', async () => {
    const access = gateway();
    access.readUserpassAccount = vi.fn(async (_session, mount, username) => ({
      mount,
      username,
      tokenPolicies: ['vc-role-readable', 'vc-user-broken'],
    }));
    access.lookupEntityByAlias = vi.fn(async () => null);
    access.listGroups = vi.fn(async () => []);
    let brokenDenied = true;
    access.readPolicy = vi.fn(async (_session, name) => {
      if (name === 'vc-user-broken' && brokenDenied) {
        throw new VaultError('authorization', { status: 403 });
      }
      return {
        name,
        policy: policyHcl(`applications/data/${name}`),
      };
    });

    renderProbe(access, account);

    await waitFor(() => expect(screen.getByTestId('unresolved')).toHaveTextContent('vc-user-broken:denied'));
    expect(screen.getByTestId('targets')).toHaveTextContent('vc-role-readable');
    brokenDenied = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry broken policy' }));

    await waitFor(() => expect(screen.getByTestId('unresolved')).toBeEmptyDOMElement());
    expect(screen.getByTestId('targets')).toHaveTextContent('vc-user-broken');
    const calls = vi.mocked(access.readPolicy).mock.calls.map((call) => call[1]);
    expect(calls.filter((name) => name === 'vc-role-readable')).toHaveLength(1);
    expect(calls.filter((name) => name === 'vc-user-broken')).toHaveLength(2);
  });

  it('bounds attached-policy reads to four concurrent requests', async () => {
    const access = gateway();
    const names = Array.from({ length: 10 }, (_, index) => `vc-user-policy-${index}`);
    access.readUserpassAccount = vi.fn(async (_session, mount, username) => ({
      mount,
      username,
      tokenPolicies: names,
    }));
    access.lookupEntityByAlias = vi.fn(async () => null);
    access.listGroups = vi.fn(async () => []);
    let active = 0;
    let maximumActive = 0;
    const releases: (() => void)[] = [];
    access.readPolicy = vi.fn((_session: VaultSession, name: string) => new Promise<{
      name: string;
      policy: string;
    }>((resolve) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      releases.push(() => {
        active -= 1;
        resolve({ name, policy: policyHcl(`applications/data/${name}`) });
      });
    }));

    renderProbe(access, account);

    await waitFor(() => expect(access.readPolicy).toHaveBeenCalledTimes(4));
    while (vi.mocked(access.readPolicy).mock.calls.length < names.length) {
      releases.splice(0).forEach((release) => release());
      await waitFor(() => expect(active).toBeGreaterThan(0));
      expect(active).toBeLessThanOrEqual(4);
    }
    releases.splice(0).forEach((release) => release());
    await waitFor(() => expect(screen.getByTestId('kind')).toHaveTextContent('report'));
    expect(maximumActive).toBe(4);
  });

  it('isolates the same username across userpass mounts', async () => {
    const access = gateway();
    access.lookupEntityByAlias = vi.fn(async () => null);
    access.listGroups = vi.fn(async () => []);
    const view = renderProbe(access, account);

    await waitFor(() => expect(screen.getByTestId('kind')).toHaveTextContent('report'));
    view.rerender(
      <QueryClientProvider client={createVaultQueryClient()}>
        <AccessControlGatewayContext.Provider value={access}>
          <ReportProbe selectedAccount={{
            username: 'alice',
            mount: 'engineering/userpass',
            mountAccessor: 'auth_engineering',
          }} />
        </AccessControlGatewayContext.Provider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(access.readUserpassAccount).toHaveBeenCalledTimes(2));
    expect(vi.mocked(access.readUserpassAccount).mock.calls.map((call) => call[1])).toEqual([
      'userpass',
      'engineering/userpass',
    ]);
  });
});
