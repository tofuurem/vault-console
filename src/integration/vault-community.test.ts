import { env } from 'node:process';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { CreateUserTransaction } from '@/application/vault/createUserTransaction';
import type { AccessControlSnapshot } from '@/application/vault/useAccessControlData';
import type { VaultIdentityGroup, VaultSession } from '@/domain/vault/contracts';
import { VaultError } from '@/domain/vault/errors';
import { vaultPassword, vaultToken } from '@/domain/vault/sensitive-value';
import { VaultAccessControlAdapter } from '@/infrastructure/vault/access-control/vault-access-control-adapter';
import { VaultAuthAdapter } from '@/infrastructure/vault/auth/vault-auth-adapter';
import { VaultKvV2Adapter } from '@/infrastructure/vault/kv-v2/vault-kv-v2-adapter';

const vaultAddress = env.VAULT_TEST_ADDR;
const rootToken = env.VAULT_TEST_TOKEN;
const runAgainstVault = vaultAddress && rootToken ? describe : describe.skip;

runAgainstVault('Vault Community integration', () => {
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 12);
  const kvMount = `console-kv-${suffix}`;
  const userpassMount = `console-userpass-${suffix}`;
  const rolePolicy = `vc-role-integration-${suffix}`;
  const groupName = `console-group-${suffix}`;
  const username = `console-user-${suffix}`;
  const password = `Vc-${crypto.randomUUID()}-9!`;
  const access = new VaultAccessControlAdapter();
  const auth = new VaultAuthAdapter();
  const kv = new VaultKvV2Adapter();
  const rootSession: VaultSession = {
    serverUrl: vaultAddress!,
    token: vaultToken(rootToken!),
    authMethod: 'token',
  };
  let group: VaultIdentityGroup | undefined;
  let transaction: CreateUserTransaction | undefined;

  async function setupRequest(path: string, method: 'POST' | 'DELETE', body?: unknown): Promise<unknown> {
    const response = await fetch(`${vaultAddress}/v1/${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Vault-Token': rootToken!,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Vault integration fixture failed with HTTP ${response.status}.`);
    return response.status === 204 ? null : response.json();
  }

  beforeAll(async () => {
    await setupRequest(`sys/mounts/${kvMount}`, 'POST', { type: 'kv', options: { version: '2' } });
    await setupRequest(`sys/auth/${userpassMount}`, 'POST', { type: 'userpass' });
    await access.writePolicy(rootSession, {
      name: rolePolicy,
      policy: [
        `path "${kvMount}/data/allowed/*" { capabilities = ["create", "read", "update"] }`,
        `path "${kvMount}/metadata/allowed" { capabilities = ["list"] }`,
        `path "${kvMount}/metadata/allowed/*" { capabilities = ["list"] }`,
      ].join('\n'),
    });
    const groupResponse = await setupRequest('identity/group', 'POST', {
      name: groupName,
      type: 'internal',
      policies: [rolePolicy],
    }) as { data: { id: string } };
    group = (await access.listGroups(rootSession)).find((candidate) => candidate.id === groupResponse.data.id);
    if (!group) throw new Error('Vault integration group was not discoverable.');
  });

  afterAll(async () => {
    if (transaction) {
      await transaction.rollback({ report: vi.fn(), signal: new AbortController().signal }).catch(() => undefined);
    }
    if (group) await setupRequest(`identity/group/id/${group.id}`, 'DELETE').catch(() => undefined);
    await access.deletePolicy(rootSession, rolePolicy).catch(() => undefined);
    await setupRequest(`sys/auth/${userpassMount}`, 'DELETE').catch(() => undefined);
    await setupRequest(`sys/mounts/${kvMount}`, 'DELETE').catch(() => undefined);
  });

  it('creates an identity-backed user and enforces allowed and denied KV v2 paths', async () => {
    const userpass = (await access.listAuthMounts(rootSession)).find((mount) => mount.path === userpassMount);
    expect(userpass).toBeDefined();
    const snapshot = {
      authMounts: [userpass!],
      userpassMounts: [userpass!],
      groups: [group!],
      policies: [],
      roles: [],
      users: [],
      warnings: [],
    } satisfies AccessControlSnapshot;
    transaction = new CreateUserTransaction(access, rootSession, snapshot, {
      username,
      displayName: `Integration ${suffix}`,
      userpassMount,
      password,
      directRolePolicyNames: [],
      groups: [group!],
    });

    await transaction.apply({ report: vi.fn(), signal: new AbortController().signal });
    await kv.writeSecret(rootSession, kvMount, 'allowed/demo', { status: 'ok' }, 0);
    await kv.writeSecret(rootSession, kvMount, 'forbidden/demo', { status: 'blocked' }, 0);
    const userSession = await auth.loginUserpass({
      serverUrl: vaultAddress!,
      mount: userpassMount,
      username,
      password: vaultPassword(password),
    });

    await expect(kv.readSecret(userSession, kvMount, 'allowed/demo')).resolves.toMatchObject({
      data: { status: 'ok' },
    });
    await expect(kv.listPaths(userSession, kvMount, 'allowed')).resolves.toContain('demo');
    await expect(kv.readSecretHistory(userSession, kvMount, 'allowed/demo')).rejects.toMatchObject({
      code: 'authorization',
    });
    await expect(kv.readSecret(userSession, kvMount, 'forbidden/demo')).rejects.toBeInstanceOf(VaultError);
  });
});
