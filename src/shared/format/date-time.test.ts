import { describe, expect, it } from 'vitest';

import { formatDateTime } from './date-time';

describe('formatDateTime', () => {
  it('uses English month names regardless of the browser locale', () => {
    expect(formatDateTime('2026-10-25T09:54:00Z')).toMatch(/^Oct 25, 2026/);
  });

  it('returns unparseable values unchanged', () => {
    expect(formatDateTime('not a date')).toBe('not a date');
  });
});
