import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  KvSearchContext,
  type KvSearchContextValue,
} from '@/application/vault/search/KvSearchContext';
import { rankKvPathMatches } from '@/application/vault/search/search-ranking';
import ExplorerMain from './ExplorerMain';

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
  matches: (_mount, query) => rankKvPathMatches([], query),
  clear: vi.fn(),
};

function renderExplorer(props: Partial<ComponentProps<typeof ExplorerMain>> = {}) {
  return render(
    <KvSearchContext.Provider value={search}>
      <ExplorerMain
        mount="applications"
        currentPath=""
        mounts={[{ path: 'applications', accessor: 'kv-apps', description: 'Application secrets', version: 2 }]}
        directory={{ status: 'success', data: ['api-token', 'folder/'] }}
        selectedPath={null}
        details={{ status: 'idle' }}
        onSelectSecret={vi.fn()}
        onNavigateToFolder={vi.fn()}
        onNavigateToBreadcrumb={vi.fn()}
        onRefresh={vi.fn()}
        onRetrySecret={vi.fn()}
        {...props}
      />
    </KvSearchContext.Provider>,
  );
}

describe('ExplorerMain keyboard shortcuts', () => {
  it('focuses the search field with slash unless the user is typing', async () => {
    const user = userEvent.setup();
    renderExplorer();
    const searchField = screen.getByRole('searchbox', { name: 'Search secret paths' });

    await user.keyboard('/');
    expect(searchField).toHaveFocus();
    expect(searchField).toHaveValue('');

    await user.keyboard('/');
    expect(searchField).toHaveValue('/');
  });

  it('opens the editor for the inspected secret with e when editing is allowed', async () => {
    const user = userEvent.setup();
    const onEditSecret = vi.fn();
    renderExplorer({
      selectedPath: 'api-token',
      onEditSecret,
      permissions: { scope: 'applications/data/api-token', discovery: 'resolved', canEdit: true },
    });

    await user.keyboard('e');
    expect(onEditSecret).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('searchbox', { name: 'Search secret paths' }));
    await user.keyboard('e');
    expect(onEditSecret).toHaveBeenCalledOnce();
  });

  it('ignores e when the policy does not allow editing or nothing is inspected', async () => {
    const user = userEvent.setup();
    const onEditSecret = vi.fn();
    const view = renderExplorer({
      selectedPath: 'api-token',
      onEditSecret,
      permissions: { scope: 'applications/data/api-token', discovery: 'resolved', canEdit: false },
    });

    await user.keyboard('e');
    view.unmount();
    renderExplorer({
      onEditSecret,
      permissions: { scope: 'applications/data/api-token', discovery: 'resolved', canEdit: true },
    });
    await user.keyboard('e');
    expect(onEditSecret).not.toHaveBeenCalled();
  });
});
