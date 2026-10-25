import { describe, expect, it, vi } from 'vitest';

import { vaultToken } from '@/domain/vault/sensitive-value';
import { AuditHttpAdapter, type AuditFetch } from './audit-http-adapter';

const session = { serverUrl: 'https://vault.example.test', token: vaultToken('hvs.op'), authMethod: 'token' as const };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('AuditHttpAdapter', () => {
  it('requests filtered events with the operator token and validates the page', async () => {
    const fetchRequest = vi.fn<AuditFetch>().mockResolvedValue(json({
      events: [{
        time: '2026-10-25T10:00:00Z',
        requestId: 'r1',
        operation: 'update',
        path: 'applications/data/a',
        actor: 'alice',
        outcome: 'error',
        error: 'permission denied',
      }],
      scannedBytes: 2048,
      exhausted: false,
      nextBefore: '2026-10-25T10:00:00Z',
    }));
    const page = await new AuditHttpAdapter(fetchRequest).events(
      session,
      { text: ' prod ', outcome: 'error', operation: '' },
      '2026-10-26T00:00:00Z',
    );

    expect(page.events[0]).toMatchObject({ actor: 'alice', outcome: 'error' });
    const [url, init] = fetchRequest.mock.calls[0];
    expect(String(url)).toBe('https://vault.example.test/audit-api/v1/events?limit=100&q=prod&outcome=error&before=2026-10-26T00%3A00%3A00Z');
    expect(new Headers(init?.headers).get('X-Vault-Token')).toBe('hvs.op');
  });

  it('maps reader statuses to console errors', async () => {
    for (const [status, code] of [[401, 'session-expired'], [403, 'authorization'], [404, 'not-found'], [502, 'unavailable']] as const) {
      const adapter = new AuditHttpAdapter(vi.fn<AuditFetch>().mockResolvedValue(json({ error: 'x' }, status)));
      await expect(adapter.status(session)).rejects.toMatchObject({ code });
    }
  });

  it('rejects malformed events', async () => {
    const adapter = new AuditHttpAdapter(vi.fn<AuditFetch>().mockResolvedValue(json({
      events: [{ time: 't', requestId: 'r', operation: 'read', path: 'p', actor: 'a', outcome: 'maybe' }],
      scannedBytes: 1,
      exhausted: true,
    })));
    await expect(adapter.events(session, {})).rejects.toMatchObject({ code: 'invalid-response' });
  });
});
