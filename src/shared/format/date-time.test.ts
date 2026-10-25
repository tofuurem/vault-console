import { describe, expect, it } from 'vitest';

import { formatDateTime, formatRelativeTime } from './date-time';

describe('formatDateTime', () => {
  it('uses English month names regardless of the browser locale', () => {
    expect(formatDateTime('2026-10-25T09:54:00Z')).toMatch(/^Oct 25, 2026/);
  });

  it('returns unparseable values unchanged', () => {
    expect(formatDateTime('not a date')).toBe('not a date');
  });
});

describe('formatRelativeTime', () => {
  const now = Date.parse('2026-10-25T12:00:00Z');

  it.each([
    ['2026-10-25T11:59:30Z', 'just now'],
    ['2026-10-25T11:55:00Z', '5m ago'],
    ['2026-10-25T09:00:00Z', '3h ago'],
    ['2026-10-22T12:00:00Z', '3d ago'],
    ['2026-08-20T12:00:00Z', '2mo ago'],
    ['2024-10-01T12:00:00Z', '2y ago'],
  ])('formats %s as %s', (value, expected) => {
    expect(formatRelativeTime(value, now)).toBe(expected);
  });

  it('treats small future offsets as now and larger ones as upcoming', () => {
    expect(formatRelativeTime('2026-10-25T12:00:20Z', now)).toBe('just now');
    expect(formatRelativeTime('2026-10-25T14:00:00Z', now)).toBe('in 2h');
  });

  it('accepts timestamps and dates', () => {
    expect(formatRelativeTime(now - 90_000, now)).toBe('1m ago');
    expect(formatRelativeTime(new Date(now - 86_400_000), now)).toBe('1d ago');
  });

  it('returns unparseable values unchanged', () => {
    expect(formatRelativeTime('not a date', now)).toBe('not a date');
    expect(formatRelativeTime(Number.NaN, now)).toBe('');
  });
});
