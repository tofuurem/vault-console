import { describe, expect, it } from 'vitest';

import { VaultError } from '@/domain/vault/errors';
import { createSafeDiagnostic, serializeSafeDiagnostic } from './safe-diagnostic';

describe('safe diagnostics', () => {
  it('redacts concrete routes and retains bounded operational context', () => {
    const error = new VaultError('authorization', {
      status: 403,
      diagnostic: {
        operation: 'POST /v1/:vault-path',
        durationMs: 42.7,
        retryCount: 1,
        requestId: '9b4d3315-14e3-4d0c-8ac3-47ab4faeef3c',
      },
    });

    expect(createSafeDiagnostic(error, '/explorer/payments/production/database', {
      buildVersion: '0.2.1',
      userAgent: 'Mozilla/5.0 Chrome/126.0.0.0 Safari/537.36',
      viewportWidth: 600,
    })).toEqual({
      buildVersion: '0.2.1',
      route: '/explorer/:mount/*',
      operation: 'POST /v1/:vault-path',
      errorCode: 'authorization',
      status: 403,
      durationMs: 43,
      retryCount: 1,
      vaultRequestId: '9b4d3315-14e3-4d0c-8ac3-47ab4faeef3c',
      runtime: 'Chrome 126.0.0.0',
      viewport: 'compact',
    });
  });

  it('drops untrusted diagnostic strings and sensitive route identity', () => {
    const secret = 'do-not-leak';
    const record = createSafeDiagnostic(new VaultError('unknown', {
      diagnostic: {
        operation: `GET /v1/secret/data/${secret}`,
        requestId: secret,
      },
    }), `/access-control/users/${secret}`, {
      userAgent: secret,
      viewportWidth: 1440,
    });
    const serialized = serializeSafeDiagnostic(record);

    expect(serialized).not.toContain(secret);
    expect(record.route).toBe('/access-control/users/:username');
    expect(record.operation).toBe('Vault operation');
    expect(record.vaultRequestId).toBeUndefined();
    expect(record.runtime).toBe('Browser unavailable');
  });
});
