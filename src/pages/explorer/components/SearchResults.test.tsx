import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { KvSearchMountState } from '@/application/vault/search/KvSearchContext';
import SearchResults from './SearchResults';

function state(
  status: KvSearchMountState['status'],
  overrides: Partial<KvSearchMountState> = {},
): KvSearchMountState {
  return {
    mount: 'applications',
    status,
    entries: [],
    pendingPrefixes: [],
    visitedPrefixes: [],
    inaccessiblePrefixes: [],
    failedPrefixes: [],
    totalListRequests: 0,
    totalScannedPrefixes: 0,
    ...overrides,
  };
}

describe('SearchResults', () => {
  it('never reports complete absence while mount coverage is partial', () => {
    render(
      <SearchResults
        query="missing"
        scope="mount"
        matches={[]}
        indexState={state('partial', {
          inaccessiblePrefixes: ['private/'],
          totalScannedPrefixes: 12,
        })}
        onOpen={vi.fn()}
        onCancel={vi.fn()}
        onContinue={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText(/No matches in indexed paths yet/i)).toBeVisible();
    expect(screen.getByText(/partial coverage/i)).toBeVisible();
    expect(screen.queryByText(/No matching paths in this mount/i)).not.toBeInTheDocument();
  });

  it('opens a typed result and exposes continuation at the safety limit', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onContinue = vi.fn();
    const entry = {
      mount: 'applications',
      path: 'platform/api-token',
      name: 'api-token',
      kind: 'secret' as const,
    };
    render(
      <SearchResults
        query="api"
        scope="mount"
        matches={[{ entry, score: 10 }]}
        indexState={state('limit-reached', {
          entries: [entry],
          pendingPrefixes: ['more/'],
          totalListRequests: 2_000,
          totalScannedPrefixes: 1_999,
        })}
        onOpen={onOpen}
        onCancel={vi.fn()}
        onContinue={onContinue}
        onRetry={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Open secret platform\/api-token/i }));
    expect(onOpen).toHaveBeenCalledWith(entry);
    await user.click(screen.getByRole('button', { name: 'Continue scan' }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
