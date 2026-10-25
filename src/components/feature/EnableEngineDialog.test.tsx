import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { fakeEnginesGateway, renderWithEngines } from '@/test/engines';
import EnableEngineDialog from './EnableEngineDialog';

describe('EnableEngineDialog', () => {
  it('suggests a path per type, validates input, and enables the engine', async () => {
    const user = userEvent.setup();
    const engines = fakeEnginesGateway();
    const onEnabled = vi.fn();
    renderWithEngines(
      <EnableEngineDialog open existingPaths={['database']} onClose={vi.fn()} onEnabled={onEnabled} />,
      { engines },
    );

    const path = screen.getByLabelText('Mount path');
    expect(path).toHaveValue('database');
    await user.click(screen.getByRole('button', { name: 'Enable Database' }));
    expect(screen.getByText('Another engine already uses this path.')).toBeVisible();

    await user.click(screen.getByRole('radio', { name: /Transit/ }));
    expect(path).toHaveValue('transit');
    await user.click(screen.getByText('Lease limits'));
    await user.type(screen.getByLabelText('Max lease TTL'), '24h');
    await user.click(screen.getByRole('button', { name: 'Enable Transit' }));

    await waitFor(() => expect(engines.enableEngine).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      path: 'transit',
      type: 'transit',
      maxLeaseTtl: '24h',
    })));
    expect(onEnabled).toHaveBeenCalledWith('transit', 'transit');
  });

  it('keeps a typed path when switching types and sends KV v2 options', async () => {
    const user = userEvent.setup();
    const engines = fakeEnginesGateway();
    renderWithEngines(
      <EnableEngineDialog open existingPaths={[]} onClose={vi.fn()} onEnabled={vi.fn()} />,
      { engines },
    );
    const path = screen.getByLabelText('Mount path');
    await user.clear(path);
    await user.type(path, 'team/secrets');
    await user.click(screen.getByRole('radio', { name: /Key\/value/ }));
    expect(path).toHaveValue('team/secrets');
    await user.click(screen.getByRole('button', { name: 'Enable Key/value' }));
    await waitFor(() => expect(engines.enableEngine).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      path: 'team/secrets',
      type: 'kv',
      options: { version: '2' },
    })));
  });
});
