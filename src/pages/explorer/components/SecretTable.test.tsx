import { act, render, screen, within } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { KvSecretSummaries } from '@/application/vault/useKvSecretSummaries';
import SecretTable from './SecretTable';

const DAY_MS = 86_400_000;

type ObserverCallback = ConstructorParameters<typeof IntersectionObserver>[0];

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  readonly observed = new Set<Element>();
  private readonly callback: ObserverCallback;
  constructor(callback: ObserverCallback) {
    this.callback = callback;
    FakeIntersectionObserver.instances.push(this);
  }
  observe(element: Element) {
    this.observed.add(element);
  }
  unobserve(element: Element) {
    this.observed.delete(element);
  }
  disconnect() {
    this.observed.clear();
  }
  reveal(elements: readonly Element[]) {
    this.callback(
      elements.map((target) => ({ target, isIntersecting: true }) as IntersectionObserverEntry),
      this as unknown as IntersectionObserver,
    );
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeIntersectionObserver.instances = [];
});

const mixedEntries = [
  { kind: 'folder' as const, name: 'platform', path: 'platform/' },
  { kind: 'secret' as const, name: 'database', path: 'database' },
  { kind: 'secret' as const, name: 'api', path: 'api' },
  { kind: 'secret' as const, name: 'redis', path: 'redis' },
];

function summariesNow(): KvSecretSummaries {
  const now = Date.now();
  return new Map([
    ['database', {
      status: 'success',
      data: {
        updatedTime: new Date(now - 3 * DAY_MS).toISOString(),
        currentVersion: 12,
        owner: 'payments-team',
      },
    }],
    ['api', {
      status: 'success',
      data: { updatedTime: new Date(now - 2 * 60_000).toISOString(), currentVersion: 3 },
    }],
    ['redis', { status: 'unavailable' }],
  ]);
}

function rowNames() {
  return screen.getAllByRole('row').slice(1).map((row) => (
    within(row).getAllByRole('button')[0].textContent
  ));
}

describe('SecretTable', () => {
  it('uses semantic buttons for folders and secrets', async () => {
    const user = userEvent.setup();
    const onNavigateToFolder = vi.fn();
    const onSelectSecret = vi.fn();
    render(
      <SecretTable
        entries={[
          { kind: 'folder', name: 'platform', path: 'platform/' },
          { kind: 'secret', name: 'database', path: 'database' },
        ]}
        selectedPath={null}
        onNavigateToFolder={onNavigateToFolder}
        onSelectSecret={onSelectSecret}
      />,
    );

    const folder = screen.getByRole('button', { name: 'Open folder platform/' });
    folder.focus();
    await user.keyboard('{Enter}');
    expect(onNavigateToFolder).toHaveBeenCalledWith('platform/');

    const secret = screen.getByRole('button', { name: 'Inspect secret database' });
    secret.focus();
    await user.keyboard(' ');
    expect(onSelectSecret).toHaveBeenCalledWith('database');
  });

  it('pins folders and secrets without opening them', async () => {
    const user = userEvent.setup();
    const onToggleFavorite = vi.fn();
    render(
      <SecretTable
        entries={[
          { kind: 'folder', name: 'platform', path: 'platform/' },
          { kind: 'secret', name: 'database', path: 'database' },
        ]}
        selectedPath={null}
        onNavigateToFolder={vi.fn()}
        onSelectSecret={vi.fn()}
        isFavorite={(entry) => entry.path === 'database'}
        onToggleFavorite={onToggleFavorite}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Pin folder platform/' }));
    expect(onToggleFavorite).toHaveBeenLastCalledWith({
      kind: 'folder',
      name: 'platform',
      path: 'platform/',
    });

    await user.click(screen.getByRole('button', { name: 'Unpin secret database' }));
    expect(onToggleFavorite).toHaveBeenLastCalledWith({
      kind: 'secret',
      name: 'database',
      path: 'database',
    });
  });

  it('selects only secret rows and exposes a visible select-all control', () => {
    const onSelectionChange = vi.fn();
    const onToggleSelectAll = vi.fn();
    render(
      <SecretTable
        entries={[
          { kind: 'folder', name: 'platform', path: 'platform/' },
          { kind: 'secret', name: 'database', path: 'database' },
          { kind: 'secret', name: 'redis', path: 'redis' },
        ]}
        selectedPath={null}
        selectedPaths={['database']}
        onNavigateToFolder={vi.fn()}
        onSelectSecret={vi.fn()}
        onSelectionChange={onSelectionChange}
        onToggleSelectAll={onToggleSelectAll}
      />,
    );

    expect(screen.queryByRole('checkbox', { name: /folder platform/i }))
      .not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Deselect secret database' }))
      .toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('checkbox', { name: 'Select all visible secrets' }))
      .toHaveAttribute('aria-checked', 'mixed');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select secret redis' }), {
      shiftKey: true,
    });
    expect(onSelectionChange).toHaveBeenCalledWith(
      { kind: 'secret', name: 'redis', path: 'redis' },
      true,
      true,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all visible secrets' }));
    expect(onToggleSelectAll).toHaveBeenCalledOnce();
  });

  it('offers permanent deletion only for secret rows', async () => {
    const user = userEvent.setup();
    const onDeletePermanently = vi.fn();
    render(
      <SecretTable
        entries={[
          { kind: 'folder', name: 'platform', path: 'platform/' },
          { kind: 'secret', name: 'database', path: 'database' },
        ]}
        selectedPath={null}
        onNavigateToFolder={vi.fn()}
        onSelectSecret={vi.fn()}
        onDeletePermanently={onDeletePermanently}
      />,
    );

    expect(screen.queryByRole('button', {
      name: 'Delete key permanently platform/',
    })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', {
      name: 'Delete key permanently database',
    }));
    expect(onDeletePermanently).toHaveBeenCalledWith('database');
  });

  it('keeps one comfortable desktop layout and mobile touch targets', () => {
    render(
      <SecretTable
        entries={[{ kind: 'secret', name: 'database', path: 'database' }]}
        selectedPath={null}
        onNavigateToFolder={vi.fn()}
        onSelectSecret={vi.fn()}
        isFavorite={() => false}
        onToggleFavorite={vi.fn()}
      />,
    );

    expect(screen.getByRole('table')).not.toHaveAttribute('data-density');
    expect(screen.getByRole('button', {
      name: 'Inspect secret database',
    })).toHaveClass('min-h-11', 'sm:min-h-8');
    expect(screen.getByRole('button', {
      name: 'Pin secret database',
    })).toHaveClass('h-11', 'w-11', 'sm:h-7', 'sm:w-7');
  });

  it('keeps the empty-state create action touch-sized on mobile', () => {
    render(
      <SecretTable
        entries={[]}
        selectedPath={null}
        onNavigateToFolder={vi.fn()}
        onSelectSecret={vi.fn()}
        onCreateSecret={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Create secret' }))
      .toHaveClass('h-11', 'sm:h-8');
  });

  it('replaces the logical path column with update time, version and owner', () => {
    render(
      <SecretTable
        entries={mixedEntries}
        selectedPath={null}
        onNavigateToFolder={vi.fn()}
        onSelectSecret={vi.fn()}
        summaries={summariesNow()}
      />,
    );

    expect(screen.queryByRole('columnheader', { name: 'Logical path' })).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Updated' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Version' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Owner' })).toBeInTheDocument();

    const database = screen.getByRole('button', { name: 'Inspect secret database' }).closest('tr')!;
    const updated = within(database).getByText('3d ago');
    expect(updated.tagName).toBe('TIME');
    expect(updated).toHaveAttribute('title', expect.stringMatching(/\d{4}/));
    expect(updated.closest('td')).toHaveClass('tabular-nums');
    expect(within(database).getByText('12').closest('td')).toHaveClass('tabular-nums');
    expect(within(database).getByText('payments-team')).toBeInTheDocument();

    const folder = screen.getByRole('button', { name: 'Open folder platform/' }).closest('tr')!;
    expect(within(folder).getAllByText('—')).toHaveLength(3);
    const denied = screen.getByRole('button', { name: 'Inspect secret redis' }).closest('tr')!;
    expect(within(denied).getAllByText('—')).toHaveLength(3);
    const ownerless = screen.getByRole('button', { name: 'Inspect secret api' }).closest('tr')!;
    expect(within(ownerless).getByText('2m ago')).toBeInTheDocument();
    expect(within(ownerless).getAllByText('—')).toHaveLength(1);
  });

  it('keeps only the name visible on narrow phones', () => {
    render(
      <SecretTable
        entries={mixedEntries}
        selectedPath={null}
        onNavigateToFolder={vi.fn()}
        onSelectSecret={vi.fn()}
      />,
    );

    expect(screen.getByRole('columnheader', { name: 'Updated' }))
      .toHaveClass('hidden', 'min-[420px]:table-cell');
    expect(screen.getByRole('columnheader', { name: 'Version' })).toHaveClass('hidden', 'md:table-cell');
    expect(screen.getByRole('columnheader', { name: 'Owner' })).toHaveClass('hidden', 'lg:table-cell');
    expect(screen.getByRole('columnheader', { name: 'Name' })).not.toHaveClass('hidden');
  });

  it('sorts by name, update time and version from accessible header buttons', async () => {
    const user = userEvent.setup();
    render(
      <SecretTable
        entries={mixedEntries}
        selectedPath={null}
        onNavigateToFolder={vi.fn()}
        onSelectSecret={vi.fn()}
        summaries={summariesNow()}
      />,
    );

    const nameHeader = screen.getByRole('columnheader', { name: 'Name' });
    expect(nameHeader).toHaveAttribute('aria-sort', 'ascending');
    expect(rowNames()).toEqual(['platform/', 'api', 'database', 'redis']);

    await user.click(within(nameHeader).getByRole('button', { name: 'Name' }));
    expect(nameHeader).toHaveAttribute('aria-sort', 'descending');
    expect(rowNames()).toEqual(['platform/', 'redis', 'database', 'api']);

    const updatedHeader = screen.getByRole('columnheader', { name: 'Updated' });
    await user.click(within(updatedHeader).getByRole('button', { name: 'Updated' }));
    expect(updatedHeader).toHaveAttribute('aria-sort', 'descending');
    expect(nameHeader).not.toHaveAttribute('aria-sort');
    expect(rowNames()).toEqual(['platform/', 'api', 'database', 'redis']);

    const versionHeader = screen.getByRole('columnheader', { name: 'Version' });
    await user.click(within(versionHeader).getByRole('button', { name: 'Version' }));
    expect(versionHeader).toHaveAttribute('aria-sort', 'descending');
    expect(rowNames()).toEqual(['platform/', 'database', 'api', 'redis']);
    await user.click(within(versionHeader).getByRole('button', { name: 'Version' }));
    expect(versionHeader).toHaveAttribute('aria-sort', 'ascending');
    expect(rowNames()).toEqual(['platform/', 'api', 'database', 'redis']);
  });

  it('reports the displayed secret order for range selection', async () => {
    const user = userEvent.setup();
    const onDisplayOrderChange = vi.fn();
    render(
      <SecretTable
        entries={mixedEntries}
        selectedPath={null}
        onNavigateToFolder={vi.fn()}
        onSelectSecret={vi.fn()}
        onDisplayOrderChange={onDisplayOrderChange}
      />,
    );

    expect(onDisplayOrderChange).toHaveBeenLastCalledWith(['api', 'database', 'redis']);
    await user.click(screen.getByRole('button', { name: 'Name' }));
    expect(onDisplayOrderChange).toHaveBeenLastCalledWith(['redis', 'database', 'api']);
  });

  it('reports secret rows once they scroll into view', () => {
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
    const onRowsSeen = vi.fn();
    render(
      <SecretTable
        entries={mixedEntries}
        selectedPath={null}
        onNavigateToFolder={vi.fn()}
        onSelectSecret={vi.fn()}
        onRowsSeen={onRowsSeen}
      />,
    );

    const [observer] = FakeIntersectionObserver.instances;
    expect(observer.observed.size).toBe(3);
    const databaseRow = screen.getByRole('button', { name: 'Inspect secret database' }).closest('tr')!;
    act(() => observer.reveal([databaseRow]));
    expect(onRowsSeen).toHaveBeenCalledWith(['database']);
    expect(observer.observed.has(databaseRow)).toBe(false);
    expect(observer.observed.size).toBe(2);
  });

  it('moves between rows with the arrow keys and opens the focused row with Enter', async () => {
    const user = userEvent.setup();
    const onNavigateToFolder = vi.fn();
    const onSelectSecret = vi.fn();
    render(
      <SecretTable
        entries={mixedEntries}
        selectedPath={null}
        onNavigateToFolder={onNavigateToFolder}
        onSelectSecret={onSelectSecret}
        isFavorite={() => false}
        onToggleFavorite={vi.fn()}
      />,
    );

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: 'Open folder platform/' })).toHaveFocus();
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(screen.getByRole('button', { name: 'Inspect secret database' })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('button', { name: 'Inspect secret api' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('button', { name: 'Inspect secret redis' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: 'Inspect secret redis' })).toHaveFocus();

    screen.getByRole('button', { name: 'Pin secret api' }).focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: 'Inspect secret database' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onSelectSecret).toHaveBeenCalledWith('database');

    await user.keyboard('{Home}{Enter}');
    expect(onNavigateToFolder).toHaveBeenCalledWith('platform/');
  });

  it('starts arrow navigation from the inspected secret', async () => {
    const user = userEvent.setup();
    render(
      <>
        <input aria-label="Elsewhere" />
        <SecretTable
          entries={mixedEntries}
          selectedPath="database"
          onNavigateToFolder={vi.fn()}
          onSelectSecret={vi.fn()}
        />
      </>,
    );

    await user.click(screen.getByLabelText('Elsewhere'));
    await user.keyboard('{ArrowDown}');
    expect(screen.getByLabelText('Elsewhere')).toHaveFocus();

    (document.activeElement as HTMLElement).blur();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: 'Inspect secret database' })).toHaveFocus();
  });
});
