import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import CreateSecretDrawer from './CreateSecretDrawer';

describe('CreateSecretDrawer raw JSON', () => {
  it('uses the shared editor and focuses an exact nested syntax error before review', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => undefined);
    render(
      <CreateSecretDrawer
        open
        onClose={vi.fn()}
        mount="applications"
        currentPath="platform/"
        onSave={onSave}
      />,
    );

    await user.type(screen.getByLabelText('Secret name'), 'database');
    await user.click(screen.getByRole('button', { name: 'Raw JSON' }));
    const editor = await screen.findByLabelText('Secret JSON editor');
    await user.click(editor);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('{\n  "database": {\n    "port":,\n    "enabled": true\n  }\n}');

    expect(screen.getByRole('alert')).toHaveTextContent(
      'JSON syntax error at line 3, column 12: unexpected comma or missing value.',
    );
    await user.click(screen.getByRole('button', { name: 'Review & create' }));
    await waitFor(() => expect(screen.getByText('Ln 3, Col 12')).toBeVisible());
    expect(screen.getByText('Fix the highlighted JSON error before review.')).toBeVisible();
    expect(onSave).not.toHaveBeenCalled();
  });
});
