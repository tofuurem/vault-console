import { describe, expect, it, vi } from 'vitest';

import {
  buildKvIndexCommand,
  buildVaultPathCommands,
} from './vault-path-commands';

describe('Vault path commands', () => {
  it('deduplicates cached paths while preserving favorite and recent priority', () => {
    const onOpen = vi.fn();
    const commands = buildVaultPathCommands({
      favorites: [{
        mount: 'applications',
        path: 'platform/',
        kind: 'folder',
        pinnedAt: 1,
      }],
      recents: [{
        mount: 'applications',
        path: 'shared',
        kind: 'secret',
        visitedAt: 2,
      }],
      indexed: [
        {
          mount: 'applications',
          path: 'platform/',
          name: 'platform',
          kind: 'folder',
        },
        {
          mount: 'applications',
          path: 'shared',
          name: 'shared',
          kind: 'secret',
        },
        {
          mount: 'applications',
          path: 'billing/database',
          name: 'database',
          kind: 'secret',
        },
      ],
      onOpen,
    });

    expect(commands).toHaveLength(3);
    expect(commands.map(({ group }) => group)).toEqual([
      'Favorite folder',
      'Recent secret',
      'Indexed secret',
    ]);

    commands[2].run();
    expect(onOpen).toHaveBeenCalledWith({
      mount: 'applications',
      path: 'billing/database',
      kind: 'secret',
    });
  });

  it('offers start, continue, cancel, and no command for complete coverage', () => {
    const actions = {
      onStart: vi.fn(),
      onContinue: vi.fn(),
      onRestart: vi.fn(),
      onCancel: vi.fn(),
    };
    const state = {
      mount: 'applications',
      status: 'idle' as const,
      entries: [],
      pendingPrefixes: [],
      visitedPrefixes: [],
      inaccessiblePrefixes: [],
      failedPrefixes: [],
      totalListRequests: 0,
      totalScannedPrefixes: 0,
    };

    const start = buildKvIndexCommand({ mount: 'applications', state, ...actions });
    expect(start?.label).toBe('Search entire applications/');
    start?.run();
    expect(actions.onStart).toHaveBeenCalledOnce();

    const resume = buildKvIndexCommand({
      mount: 'applications',
      state: { ...state, status: 'partial', pendingPrefixes: ['platform/'] },
      ...actions,
    });
    expect(resume?.label).toBe('Continue searching applications/');
    resume?.run();
    expect(actions.onContinue).toHaveBeenCalledOnce();

    const cancel = buildKvIndexCommand({
      mount: 'applications',
      state: { ...state, status: 'scanning', entries: [{
        mount: 'applications',
        path: 'platform/api',
        name: 'api',
        kind: 'secret',
      }] },
      ...actions,
    });
    expect(cancel?.label).toBe('Cancel search in applications/');
    cancel?.run();
    expect(actions.onCancel).toHaveBeenCalledOnce();

    expect(buildKvIndexCommand({
      mount: 'applications',
      state: { ...state, status: 'complete' },
      ...actions,
    })).toBeNull();
  });
});
