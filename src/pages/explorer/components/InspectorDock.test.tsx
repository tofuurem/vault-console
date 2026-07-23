import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import InspectorDock from './InspectorDock';

function TestInspector() {
  const [tab, setTab] = useState('data');
  return (
    <div>
      <div role="tablist" aria-label="Inspector tabs">
        {['data', 'versions', 'metadata'].map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            onClick={() => setTab(name)}
          >
            {name[0].toUpperCase() + name.slice(1)}
          </button>
        ))}
      </div>
      <p>{tab} content</p>
    </div>
  );
}

function renderDock(options: { open?: boolean; onClose?: () => void } = {}) {
  return render(
    <InspectorDock
      open={options.open ?? true}
      path="applications/nested"
      onOpen={vi.fn()}
      onClose={options.onClose ?? vi.fn()}
      renderInspector={() => <TestInspector />}
    >
      <p>Directory content</p>
    </InspectorDock>,
  );
}

describe('InspectorDock', () => {
  it('starts at the bottom, resizes with the keyboard, and persists the layout', async () => {
    renderDock();

    expect(screen.getByRole('complementary', { name: 'Secret inspector' })).toBeVisible();
    const separator = screen.getByRole('separator', { name: 'Resize bottom inspector' });
    expect(separator).toHaveAttribute('aria-valuenow', '40');

    fireEvent.keyDown(separator, { key: 'ArrowUp' });
    expect(separator).toHaveAttribute('aria-valuenow', '45');
    expect(window.localStorage.getItem('vault-console:inspector-layout:v1')).toContain('"bottomRatio":0.45');
  });

  it('switches between bottom, right, and full-screen layouts without losing tabs', async () => {
    const user = userEvent.setup();
    renderDock();

    await user.click(screen.getByRole('button', { name: 'Dock inspector at right' }));
    expect(screen.getByRole('separator', { name: 'Resize right inspector' })).toBeVisible();
    expect(window.localStorage.getItem('vault-console:inspector-layout:v1')).toContain('"placement":"right"');

    await user.click(screen.getByRole('button', { name: 'Open inspector full screen' }));
    const dialog = screen.getByRole('dialog', { name: 'applications/nested' });
    expect(dialog).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Data' })).toBeVisible();
    await user.click(screen.getByRole('tab', { name: 'Versions' }));
    expect(screen.getByText('versions content')).toBeVisible();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'applications/nested' })).not.toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Secret inspector' })).toBeVisible();
  });

  it('uses a full-screen inspector on narrow viewports and closes it with Escape', () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 600 });
    const onClose = vi.fn();

    try {
      renderDock({ onClose });
      expect(screen.getByRole('dialog', { name: 'applications/nested' })).toBeVisible();
      expect(screen.queryByRole('complementary', { name: 'Secret inspector' })).not.toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledOnce();
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
    }
  });
});
