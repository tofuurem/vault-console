import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useAutoRenewSession } from './useAutoRenewSession';

describe('useAutoRenewSession', () => {
  it('renews once per lease when the warning starts and only while enabled', () => {
    const renew = vi.fn(async () => undefined);
    const { rerender } = renderHook((props: Parameters<typeof useAutoRenewSession>[0]) => useAutoRenewSession(props), {
      initialProps: { enabled: true, warning: false, leaseKey: 'a', renew },
    });
    expect(renew).not.toHaveBeenCalled();

    rerender({ enabled: true, warning: true, leaseKey: 'a', renew });
    rerender({ enabled: true, warning: true, leaseKey: 'a', renew });
    expect(renew).toHaveBeenCalledTimes(1);

    rerender({ enabled: true, warning: true, leaseKey: 'b', renew });
    expect(renew).toHaveBeenCalledTimes(2);

    rerender({ enabled: false, warning: true, leaseKey: 'c', renew });
    expect(renew).toHaveBeenCalledTimes(2);
  });

  it('does not retry a failed renewal for the same lease', async () => {
    const renew = vi.fn(async () => { throw new Error('max ttl'); });
    const { rerender } = renderHook((props: Parameters<typeof useAutoRenewSession>[0]) => useAutoRenewSession(props), {
      initialProps: { enabled: true, warning: true, leaseKey: 'a', renew },
    });
    await Promise.resolve();
    rerender({ enabled: true, warning: true, leaseKey: 'a', renew });
    expect(renew).toHaveBeenCalledTimes(1);
  });
});
