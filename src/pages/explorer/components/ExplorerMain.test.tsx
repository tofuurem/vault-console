import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  KvSearchContext,
  type KvSearchContextValue,
} from '@/application/vault/search/KvSearchContext';
import { rankKvPathMatches } from '@/application/vault/search/search-ranking';
import ExplorerMain from './ExplorerMain';

const originalClipboard = navigator.clipboard;

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: originalClipboard,
  });
});

describe('ExplorerMain search', () => {
  it('filters locally, debounces mount scans, and makes copy feedback visible', async () => {
    vi.useFakeTimers();
    const start = vi.fn();
    const cancel = vi.fn();
    let mountStatus: 'idle' | 'scanning' = 'idle';
    const onClipboardFeedback = vi.fn();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const entries = [{
      mount: 'applications',
      path: 'nested/api-token',
      name: 'api-token',
      kind: 'secret' as const,
    }];
    const search: KvSearchContextValue = {
      stateFor: (mount) => ({
        mount,
        status: mountStatus,
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
      cancel,
      activateMount: vi.fn(),
      matches: (_mount, query) => rankKvPathMatches(entries, query),
      clear: vi.fn(),
    };

    const view = render(
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
          onClipboardFeedback={onClipboardFeedback}
        />
      </KvSearchContext.Provider>,
    );

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search secret paths' }), {
      target: { value: 'api' },
    });
    expect(screen.getByRole('button', { name: 'Inspect secret api-token' })).toBeVisible();
    act(() => vi.advanceTimersByTime(500));
    expect(start).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('radio', { name: 'Entire mount' }));
    act(() => vi.advanceTimersByTime(249));
    expect(start).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(start).toHaveBeenCalledWith('applications');

    mountStatus = 'scanning';
    view.rerender(
      <KvSearchContext.Provider value={{ ...search }}>
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
          onClipboardFeedback={onClipboardFeedback}
        />
      </KvSearchContext.Provider>,
    );
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search secret paths' }), {
      target: { value: '' },
    });
    expect(cancel).toHaveBeenCalledWith('applications');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy logical path' }));
    });
    expect(writeText).toHaveBeenCalledWith('applications/');
    expect(onClipboardFeedback).toHaveBeenCalledWith('path', true);
    expect(screen.getByRole('button', { name: 'Copy logical path' }).querySelector('i'))
      .toHaveClass('ri-check-line');
  });

  it('keeps filtered selections visible in the toolbar and clears them with Escape', () => {
    const search: KvSearchContextValue = {
      stateFor: (mount) => ({
        mount,
        status: 'idle',
        entries: [],
        pendingPrefixes: [],
        visitedPrefixes: [],
        inaccessiblePrefixes: [],
        failedPrefixes: [],
        totalListRequests: 0,
        totalScannedPrefixes: 0,
      }),
      start: vi.fn(),
      continueScan: vi.fn(),
      restart: vi.fn(),
      cancel: vi.fn(),
      activateMount: vi.fn(),
      matches: vi.fn(() => []),
      clear: vi.fn(),
    };
    render(
      <KvSearchContext.Provider value={search}>
        <ExplorerMain
          mount="applications"
          currentPath=""
          mounts={[]}
          directory={{ status: 'success', data: ['api-token', 'database'] }}
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

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select secret api-token' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select secret database' }));
    expect(screen.getByText('2 selected')).toBeVisible();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search secret paths' }), {
      target: { value: 'api' },
    });
    expect(screen.getByText('1 hidden by filter')).toBeVisible();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('toolbar', { name: 'Bulk secret actions' }))
      .not.toBeInTheDocument();
  });
});
