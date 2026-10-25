import { describe, expect, it, vi } from 'vitest';

import { resolveSecretAccess } from '@/domain/access-control/secret-access';
import type { VaultSession } from '@/domain/vault/contracts';
import { VaultError } from '@/domain/vault/errors';
import { vaultToken } from '@/domain/vault/sensitive-value';
import { vaultAccessControlGatewayMock } from '@/test/vault-access-control-gateway';
import { loadSecretAccessSnapshot } from './useSecretAccess';

const session: VaultSession = {
  serverUrl: 'https://vault.example.test',
  token: vaultToken('hvs.admin'),
  authMethod: 'token',
};

const POLICIES: Readonly<Record<string, string>> = {
  'vc-role-billing-reader': 'path "applications/data/billing/*" {\n  capabilities = ["read"]\n}',
  'vc-role-unused': 'path "applications/data/other/*" {\n  capabilities = ["read"]\n}',
  'ops-legacy': 'path "applications/data/*" {\n  capabilities = ["read"]\n  allowed_parameters = {}\n}',
  default: 'path "auth/token/lookup-self" {\n  capabilities = ["read"]\n}',
};

function gateway() {
  return vaultAccessControlGatewayMock({
    listAuthMounts: vi.fn(async () => [
      { path: 'userpass', accessor: 'auth_userpass_1', type: 'userpass', description: '' },
      { path: 'partners', accessor: 'auth_userpass_2', type: 'userpass', description: '' },
      { path: 'token', accessor: 'auth_token_1', type: 'token', description: '' },
    ]),
    listUserpassAccounts: vi.fn(async (_session, mount: string) => {
      if (mount === 'partners') throw new VaultError('authorization', { status: 403 });
      return [
        { username: 'alice', mount, tokenPolicies: [] },
        { username: 'bob', mount, tokenPolicies: ['ops-legacy'], tokenNoDefaultPolicy: true },
      ];
    }),
    listEntities: vi.fn(async () => [{
      id: 'e-alice',
      name: 'alice',
      disabled: false,
      policies: [],
      groupIds: [],
      aliases: [{ id: 'a1', name: 'alice', canonicalId: 'e-alice', mountAccessor: 'auth_userpass_1' }],
    }]),
    listGroups: vi.fn(async () => [{
      id: 'g-billing',
      name: 'billing',
      policies: ['vc-role-billing-reader'],
      memberEntityIds: ['e-alice'],
      memberGroupIds: [],
      metadata: {},
    }]),
    listPolicies: vi.fn(async () => ['default', 'ops-legacy', 'vc-role-billing-reader', 'vc-role-unused']),
    readPolicy: vi.fn(async (_session, name: string) => {
      const policy = POLICIES[name];
      if (!policy) throw new VaultError('not-found', { status: 404 });
      return { name, policy };
    }),
  });
}

describe('loadSecretAccessSnapshot', () => {
  it('reads users, identities, groups, and every referenced policy once', async () => {
    const accessGateway = gateway();
    const snapshot = await loadSecretAccessSnapshot(accessGateway, session);

    expect(accessGateway.listUserpassAccounts).toHaveBeenCalledTimes(2);
    expect(snapshot.users.map((user) => [user.username, user.identity.status])).toEqual([
      ['alice', 'available'],
      ['bob', 'absent'],
    ]);
    expect(snapshot.rolePolicyNames).toEqual(['vc-role-billing-reader', 'vc-role-unused']);
    expect(snapshot.policies.map((policy) => [policy.name, policy.status])).toEqual([
      ['default', 'resolved'],
      ['ops-legacy', 'unsupported'],
      ['vc-role-billing-reader', 'resolved'],
      ['vc-role-unused', 'resolved'],
    ]);
    expect(snapshot.gaps).toEqual([{ source: 'userpass-mount', id: 'partners', reason: 'denied' }]);

    const report = resolveSecretAccess({ mount: 'applications', path: 'billing/database', ...snapshot });
    expect(report.users.map((user) => [user.label, user.capabilities])).toEqual([['alice', ['read']]]);
    expect(report.unverified.map((subject) => subject.label)).toEqual(['bob']);
    expect(report.completeness.gaps).toContainEqual({ source: 'policy', id: 'ops-legacy', reason: 'unsupported' });
  });

  it('records unreadable sources as gaps and stops on session expiry', async () => {
    const accessGateway = gateway();
    vi.mocked(accessGateway.listEntities).mockRejectedValueOnce(new VaultError('authorization', { status: 403 }));
    vi.mocked(accessGateway.listGroups).mockRejectedValueOnce(new VaultError('unavailable', { status: 503 }));

    const snapshot = await loadSecretAccessSnapshot(accessGateway, session);
    expect(snapshot.gaps).toEqual(expect.arrayContaining([
      { source: 'groups', reason: 'unavailable' },
      { source: 'entities', reason: 'denied' },
    ]));
    expect(snapshot.users.every((user) => user.identity.status === 'unknown')).toBe(true);

    vi.mocked(accessGateway.listAuthMounts).mockRejectedValueOnce(new VaultError('session-expired', { status: 403 }));
    await expect(loadSecretAccessSnapshot(accessGateway, session)).rejects.toMatchObject({ code: 'session-expired' });
  });
});
