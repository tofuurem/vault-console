import { describe, expect, it, vi } from 'vitest';

import { VaultError } from '@/domain/vault/errors';
import {
  scanKvPathIndex,
  type KvPathIndexCheckpoint,
} from './kv-path-index';

describe('scanKvPathIndex', () => {
  it('walks breadth-first with no more than four active LIST requests', async () => {
    let active = 0;
    let maxActive = 0;
    const calls: string[] = [];
    const list = vi.fn(async (path: string) => {
      calls.push(path);
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      if (path === '') return ['a/', 'b/', 'c/', 'd/', 'e/', 'root-secret'];
      return [`${path.replace('/', '')}-secret`];
    });

    const result = await scanKvPathIndex({
      mount: 'applications',
      list,
    });

    expect(calls[0]).toBe('');
    expect(new Set(calls.slice(1, 5))).toEqual(new Set(['a/', 'b/', 'c/', 'd/']));
    expect(maxActive).toBe(4);
    expect(result.status).toBe('complete');
    expect(result.entries).toHaveLength(11);
  });

  it('stops at the entry budget and continues without duplication', async () => {
    const keys = Array.from({ length: 5_001 }, (_, index) => `secret-${index}`);
    const list = vi.fn(async () => keys);

    const first = await scanKvPathIndex({
      mount: 'applications',
      list,
      limits: { maxEntries: 5_000, maxListRequests: 2_000, concurrency: 4 },
    });
    expect(first.status).toBe('limit-reached');
    expect(first.entries).toHaveLength(5_000);
    expect(first.pendingPrefixes).toEqual(['']);

    const second = await scanKvPathIndex({
      mount: 'applications',
      list,
      checkpoint: first,
      limits: { maxEntries: 5_000, maxListRequests: 2_000, concurrency: 4 },
    });
    expect(second.status).toBe('complete');
    expect(second.entries).toHaveLength(5_001);
    expect(new Set(second.entries.map((entry) => entry.path)).size).toBe(5_001);
  });

  it('keeps partial results when a scoped prefix is forbidden', async () => {
    const list = vi.fn(async (path: string) => {
      if (path === '') return ['denied/', 'visible/'];
      if (path === 'denied/') throw new VaultError('authorization', { status: 403 });
      return ['api-token'];
    });

    const result = await scanKvPathIndex({ mount: 'applications', list });

    expect(result.status).toBe('partial');
    expect(result.inaccessiblePrefixes).toEqual(['denied/']);
    expect(result.entries.some((entry) => entry.path === 'visible/api-token')).toBe(true);
  });

  it('treats a missing prefix as absent instead of policy-inaccessible', async () => {
    const list = vi.fn(async (path: string) => {
      if (path === '') return ['removed/'];
      throw new VaultError('not-found', { status: 404 });
    });

    const result = await scanKvPathIndex({ mount: 'applications', list });

    expect(result.status).toBe('complete');
    expect(result.visitedPrefixes).toContain('removed/');
    expect(result.inaccessiblePrefixes).toEqual([]);
    expect(result.failedPrefixes).toEqual([]);
  });

  it('preserves discovered entries and queues transient failures for retry', async () => {
    const list = vi.fn(async (path: string) => {
      if (path === '') return ['ok/', 'later/'];
      if (path === 'later/') throw new VaultError('unavailable');
      return ['secret'];
    });

    const result = await scanKvPathIndex({ mount: 'applications', list });

    expect(result.status).toBe('partial');
    expect(result.entries.some((entry) => entry.path === 'ok/secret')).toBe(true);
    expect(result.pendingPrefixes).toEqual(['later/']);
    expect(result.failedPrefixes).toEqual(['later/']);
  });

  it('does not start further work after abort', async () => {
    const controller = new AbortController();
    let calls = 0;
    const list = vi.fn(async (path: string, signal: AbortSignal) => {
      calls += 1;
      if (path === '') return Array.from({ length: 20 }, (_, index) => `folder-${index}/`);
      if (calls === 5) controller.abort();
      if (signal.aborted) throw new DOMException('cancelled', 'AbortError');
      await Promise.resolve();
      return ['secret'];
    });

    await expect(scanKvPathIndex({
      mount: 'applications',
      list,
      signal: controller.signal,
    })).rejects.toMatchObject({ code: 'aborted' });
    expect(calls).toBeLessThanOrEqual(5);
  });

  it('honors the LIST request budget exactly', async () => {
    const list = vi.fn(async (path: string) => (
      path === '' ? ['a/', 'b/', 'c/', 'd/', 'e/'] : []
    ));
    const checkpoint: KvPathIndexCheckpoint | undefined = undefined;

    const result = await scanKvPathIndex({
      mount: 'applications',
      list,
      checkpoint,
      limits: { maxEntries: 100, maxListRequests: 3, concurrency: 2 },
    });

    expect(result.status).toBe('limit-reached');
    expect(result.totalListRequests).toBe(3);
    expect(list).toHaveBeenCalledTimes(3);
    expect(result.pendingPrefixes.length).toBeGreaterThan(0);
  });
});
