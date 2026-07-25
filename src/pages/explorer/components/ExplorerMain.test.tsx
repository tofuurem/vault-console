import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  KvSearchContext,
  type KvSearchContextValue,
} from '@/application/vault/search/KvSearchContext';
import { rankKvPathMatches } from '@/application/vault/search/search-ranking';
import ExplorerMain from './ExplorerMain';

afterEach(() => {
  vi.useRealTimers();
});

describe('ExplorerMain search', () => {
  it('filters the current folder locally and debounces an explicit mount scan', () => {
    vi.useFakeTimers();
    const start = vi.fn();
    const entries = [{
      mount: 'applications',
      path: 'nested/api-token',
      name: 'api-token',
      kind: 'secret' as const,
    }];
    const search: KvSearchContextValue = {
      stateFor: (mount) => ({
        mount,
        status: 'idle',
        entries,
        pendingPrefixes: [],
        visitedPrefixes: [],
        inaccessiblePrefixes: [],
        failedPrefixes: [],
        totalListRequests: 0,
        totalScannedPrefixes: 0,
      }),
      start,
      continueScan: vi.fn(),
      restart: vi.fn(),
      cancel: vi.fn(),
      activateMount: vi.fn(),
      matches: (_mount, query) => rankKvPathMatches(entries, query),
      clear: vi.fn(),
    };

    render(
      <KvSearchContext.Provider value={search}>
        <ExplorerMain
          mount="applications"
          currentPath=""
          mounts={[{
            path: 'applications',
            accessor: 'kv-apps',
            description: 'Application secrets',
            version: 2,
          }]}
          directory={{ status: 'success', data: ['api-token', 'folder/'] }}
          selectedPath={null}
          details={{ status: 'idle' }}
          onSelectSecret={vi.fn()}
          onNavigateToFolder={vi.fn()}
          onNavigateToBreadcrumb={vi.fn()}
          onRefresh={vi.fn()}
          onRetrySecret={vi.fn()}
        />
      </KvSearchContext.Provider>,
    );

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search secret paths' }), {
      target: { value: 'api' },
    });
    expect(screen.getByRole('button', { name: 'Open secret api-token' })).toBeVisible();
    act(() => vi.advanceTimersByTime(500));
    expect(start).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('radio', { name: 'Entire mount' }));
    act(() => vi.advanceTimersByTime(249));
    expect(start).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(start).toHaveBeenCalledWith('applications');
  });
});
