import { describe, expect, it, vi } from 'vitest';

import {
  favoriteStorageScope,
  recordRecentPath,
  toggleFavoritePath,
  type NavigationPath,
} from './navigation-history';

function path(index: number, kind: NavigationPath['kind'] = 'secret'): NavigationPath {
  return {
    mount: 'applications',
    path: `service-${index}${kind === 'folder' ? '/' : ''}`,
    kind,
  };
}

describe('navigation history', () => {
  it('keeps the newest 20 unique successful secret paths', () => {
    let recents = [] as ReturnType<typeof recordRecentPath>;
    for (let index = 0; index < 22; index += 1) {
      recents = recordRecentPath(recents, path(index), index);
    }

    expect(recents).toHaveLength(20);
    expect(recents[0].path).toBe('service-21');
    expect(recents.at(-1)?.path).toBe('service-2');
    expect(recordRecentPath(recents, path(10), 100)[0]).toMatchObject({
      path: 'service-10',
      visitedAt: 100,
    });
    expect(recordRecentPath(recents, path(99, 'folder'), 101)).toBe(recents);
  });

  it('pins at most 100 explicit paths and toggles by full identity', () => {
    let favorites = [] as ReturnType<typeof toggleFavoritePath>;
    for (let index = 0; index < 101; index += 1) {
      favorites = toggleFavoritePath(favorites, path(index), index);
    }

    expect(favorites).toHaveLength(100);
    expect(favorites[0].path).toBe('service-100');
    expect(toggleFavoritePath(favorites, path(100), 200)).not.toContainEqual(
      expect.objectContaining({ path: 'service-100' }),
    );
  });

  it('hashes stable userpass identity without exposing server or username', async () => {
    const scope = await favoriteStorageScope({
      serverUrl: 'https://vault.example.test',
      authMethod: 'userpass',
      displayName: 'alice',
    });

    expect(scope).toMatch(/^[a-f0-9]{32}$/);
    expect(scope).not.toContain('vault');
    expect(scope).not.toContain('alice');
  });

  it('keeps token sessions scoped to the current tab', async () => {
    await expect(favoriteStorageScope({
      serverUrl: 'https://vault.example.test',
      authMethod: 'token',
      displayName: 'token-user',
    })).resolves.toBeNull();
  });

  it('returns no stable scope when hashing is unavailable', async () => {
    await expect(favoriteStorageScope({
      serverUrl: 'https://vault.example.test',
      authMethod: 'userpass',
      displayName: 'alice',
    }, vi.fn(async () => {
      throw new DOMException('blocked');
    }))).resolves.toBeNull();
  });
});
