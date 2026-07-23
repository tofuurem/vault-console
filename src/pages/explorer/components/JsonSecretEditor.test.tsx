import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import JsonSecretEditor from './JsonSecretEditor';

describe('JsonSecretEditor', () => {
  it('reports an exact validation location accessibly and delegates formatting', async () => {
    const user = userEvent.setup();
    const onFormat = vi.fn();
    render(
      <JsonSecretEditor
        value={'{\n  "ok": true,\n  "broken":,\n  "tail": 1\n}'}
        onChange={vi.fn()}
        onFormat={onFormat}
        validationError="JSON syntax error at line 3, column 12."
        validationLocation={{ line: 3, column: 12, offset: 27 }}
      />,
    );

    expect(await screen.findByLabelText('Secret JSON editor')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('JSON syntax error at line 3, column 12.');
    await user.click(screen.getByRole('button', { name: 'Go to line 3, column 12' }));
    await waitFor(() => expect(screen.getByText('Ln 3, Col 12')).toBeVisible());
    await user.click(screen.getByRole('button', { name: 'Format' }));
    expect(onFormat).toHaveBeenCalledOnce();
  });

  it('loads CodeMirror lazily and synchronizes external formatting', async () => {
    const { rerender } = render(
      <JsonSecretEditor value="{}" onChange={vi.fn()} onFormat={vi.fn()} />,
    );
    const editor = await screen.findByLabelText('Secret JSON editor');
    expect(editor).toHaveTextContent('{}');

    rerender(
      <JsonSecretEditor
        value={'{\n  "enabled": true\n}'}
        onChange={vi.fn()}
        onFormat={vi.fn()}
      />,
    );
    await waitFor(() => expect(editor).toHaveTextContent('"enabled": true'));
  });
});
