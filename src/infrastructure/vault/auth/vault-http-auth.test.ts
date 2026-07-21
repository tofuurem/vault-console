import { describe, expect, it, vi } from 'vitest';

import { vaultPassword, vaultToken } from '../../../domain/vault/sensitive-value';
import { VaultAuthAdapter } from './vault-auth-adapter';
import { VaultHttpClient, type VaultFetch } from '../http/vault-http-client';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('VaultAuthAdapter', () => {
  it('reads documented health responses even when Vault is sealed', async () => {
    const fetchRequest = vi.fn<VaultFetch>().mockResolvedValue(
      jsonResponse(
        { initialized: true, sealed: true, standby: false, version: '1.21.0' },
        503,
      ),
    );
    const gateway = new VaultAuthAdapter(new VaultHttpClient(fetchRequest));

    await expect(gateway.getHealth('https://vault.example.test')).resolves.toEqual({
      initialized: true,
      sealed: true,
      standby: false,
      version: '1.21.0',
    });
  });

  it('validates a token through lookup-self without changing the token', async () => {
    const fetchRequest = vi.fn<VaultFetch>().mockResolvedValue(
      jsonResponse({
        data: {
          display_name: 'userpass-alice',
          expire_time: '2030-01-02T03:04:05Z',
        },
      }),
    );
    const gateway = new VaultAuthAdapter(new VaultHttpClient(fetchRequest));

    const token = vaultToken('hvs.token');
    const session = await gateway.validateToken('https://vault.example.test', token);

    expect(session).toMatchObject({
      serverUrl: 'https://vault.example.test',
      authMethod: 'token',
      displayName: 'userpass-alice',
      expiresAt: Date.parse('2030-01-02T03:04:05Z'),
    });
    expect(session.token).toBe(token);
    expect(new Headers(fetchRequest.mock.calls[0][1]?.headers).get('X-Vault-Token')).toBe('hvs.token');
  });

  it('logs in through a custom userpass mount and encodes the username', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T12:00:00Z'));
    const fetchRequest = vi.fn<VaultFetch>().mockResolvedValue(
      jsonResponse({
        auth: {
          client_token: 'hvs.session',
          lease_duration: 3600,
          metadata: { username: 'alice@example.com' },
        },
      }),
    );
    const gateway = new VaultAuthAdapter(new VaultHttpClient(fetchRequest));

    const session = await gateway.loginUserpass({
      serverUrl: 'https://vault.example.test',
      mount: 'team/userpass',
      username: 'alice@example.com',
      password: vaultPassword('not-logged'),
    });

    expect(String(fetchRequest.mock.calls[0][0])).toBe(
      'https://vault.example.test/v1/auth/team/userpass/login/alice%40example.com',
    );
    expect(session).toMatchObject({
      serverUrl: 'https://vault.example.test',
      authMethod: 'userpass',
      displayName: 'alice@example.com',
      expiresAt: Date.parse('2026-07-21T13:00:00Z'),
    });
    expect(session.token.reveal()).toBe('hvs.session');
    vi.useRealTimers();
  });

  it('classifies rejected userpass credentials as authentication errors', async () => {
    const gateway = new VaultAuthAdapter(
      new VaultHttpClient(
        vi.fn<VaultFetch>().mockResolvedValue(jsonResponse({ errors: ['permission denied'] }, 403)),
      ),
    );

    await expect(
      gateway.loginUserpass({
        serverUrl: 'https://vault.example.test',
        mount: 'userpass',
        username: 'alice',
        password: vaultPassword('wrong'),
      }),
    ).rejects.toMatchObject({ code: 'authentication' });
  });

  it('queries the current token capabilities for every requested path', async () => {
    const fetchRequest = vi.fn<VaultFetch>().mockResolvedValue(
      jsonResponse({
        'sys/auth': ['read', 'sudo'],
        'identity/group/id': ['deny'],
      }),
    );
    const gateway = new VaultAuthAdapter(new VaultHttpClient(fetchRequest));
    const session = {
      serverUrl: 'https://vault.example.test',
      token: vaultToken('hvs.admin'),
      authMethod: 'token' as const,
    };

    await expect(
      gateway.getCapabilities(session, ['sys/auth', 'identity/group/id']),
    ).resolves.toEqual({
      'sys/auth': ['read', 'sudo'],
      'identity/group/id': ['deny'],
    });

    expect(String(fetchRequest.mock.calls[0][0])).toBe(
      'https://vault.example.test/v1/sys/capabilities-self',
    );
    expect(fetchRequest.mock.calls[0][1]?.method).toBe('POST');
    expect(fetchRequest.mock.calls[0][1]?.body).toBe(
      JSON.stringify({ paths: ['sys/auth', 'identity/group/id'] }),
    );
  });
});
