import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SecretJsonParseResult } from '@/domain/vault/secret-json';
import { useDeferredSecretJsonValidation } from './useDeferredSecretJsonValidation';

interface DeferredResult {
  readonly promise: Promise<SecretJsonParseResult>;
  readonly resolve: (result: SecretJsonParseResult) => void;
}

function deferredResult(): DeferredResult {
  let resolve!: (result: SecretJsonParseResult) => void;
  const promise = new Promise<SecretJsonParseResult>((next) => { resolve = next; });
  return { promise, resolve };
}

afterEach(() => vi.useRealTimers());

describe('useDeferredSecretJsonValidation', () => {
  it('debounces validation and ignores an older revision that finishes last', async () => {
    vi.useFakeTimers();
    const first = deferredResult();
    const second = deferredResult();
    const validate = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result, rerender } = renderHook(
      ({ source }) => useDeferredSecretJsonValidation(source, {
        delayMs: 250,
        validateInBackground: validate,
      }),
      { initialProps: { source: '{"revision":1}' } },
    );

    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    rerender({ source: '{"revision":2}' });
    await act(async () => { await vi.advanceTimersByTimeAsync(249); });
    expect(validate).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });

    await act(async () => second.resolve({ ok: true, data: { revision: 2 } }));
    expect(result.current.result).toEqual({ ok: true, data: { revision: 2 } });

    await act(async () => first.resolve({
      ok: false,
      kind: 'root',
      message: 'stale result',
    }));
    expect(result.current.result).toEqual({ ok: true, data: { revision: 2 } });
  });

  it('validates the exact current source immediately before an action', () => {
    vi.useFakeTimers();
    const validate = vi.fn(async () => ({ ok: true as const, data: {} }));
    const { result, rerender } = renderHook(
      ({ source }) => useDeferredSecretJsonValidation(source, {
        validateInBackground: validate,
      }),
      { initialProps: { source: '{}' } },
    );

    rerender({ source: '{"broken":}' });
    let exact: SecretJsonParseResult | undefined;
    act(() => { exact = result.current.validateNow(); });

    expect(exact?.ok).toBe(false);
    expect(result.current.status).toBe('invalid');
    expect(validate).not.toHaveBeenCalled();
  });
});
