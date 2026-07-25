import { describe, expect, it } from 'vitest';

import { defaultToastDuration } from './toast';

describe('toast defaults', () => {
  it('uses short success, measured status, long action, and persistent error durations', () => {
    expect(defaultToastDuration('success')).toBe(4_000);
    expect(defaultToastDuration('info')).toBe(6_000);
    expect(defaultToastDuration('warning')).toBe(6_000);
    expect(defaultToastDuration('action')).toBe(10_000);
    expect(defaultToastDuration('error')).toBeNull();
  });
});
