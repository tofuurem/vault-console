import { describe, expect, it, vi } from 'vitest';

import type {
  SecretJsonValidationRequest,
  SecretJsonValidationResponse,
} from './secret-json-validation';
import {
  createSecretJsonValidationClient,
  isLargeSecretJson,
  LARGE_SECRET_JSON_BYTES,
  secretJsonUtf8Bytes,
} from './secret-json-validation';

class FakeWorker {
  messageListener?: (event: MessageEvent<SecretJsonValidationResponse>) => void;
  errorListener?: () => void;
  readonly requests: SecretJsonValidationRequest[] = [];
  terminated = false;

  postMessage(message: SecretJsonValidationRequest) {
    this.requests.push(message);
  }

  addEventListener(type: 'message' | 'error', listener: never) {
    if (type === 'message') {
      this.messageListener = listener as (event: MessageEvent<SecretJsonValidationResponse>) => void;
    } else {
      this.errorListener = listener as () => void;
    }
  }

  terminate() {
    this.terminated = true;
  }

  respond(response: SecretJsonValidationResponse) {
    this.messageListener?.({ data: response } as MessageEvent<SecretJsonValidationResponse>);
  }
}

describe('secret JSON background validation', () => {
  it('uses a worker without exposing the document in its result metadata', async () => {
    const worker = new FakeWorker();
    const client = createSecretJsonValidationClient(() => worker);
    const validation = client.validate('{"token":"private"}');
    const request = worker.requests[0];

    worker.respond({ id: request.id, result: { ok: true, data: { token: 'private' } } });

    await expect(validation).resolves.toEqual({ ok: true, data: { token: 'private' } });
    client.dispose();
    expect(worker.terminated).toBe(true);
  });

  it('falls back to a deferred main-thread validation when workers are unavailable', async () => {
    vi.useFakeTimers();
    const client = createSecretJsonValidationClient(() => null);
    const validation = client.validate('{"enabled":true}');

    await vi.runAllTimersAsync();

    await expect(validation).resolves.toEqual({ ok: true, data: { enabled: true } });
    vi.useRealTimers();
  });

  it('uses an exact UTF-8 soft threshold for large documents', () => {
    expect(secretJsonUtf8Bytes('я')).toBe(2);
    expect(isLargeSecretJson('x'.repeat(LARGE_SECRET_JSON_BYTES))).toBe(false);
    expect(isLargeSecretJson('x'.repeat(LARGE_SECRET_JSON_BYTES + 1))).toBe(true);
  });
});
