import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import JsonSecretEditor from './JsonSecretEditor';

describe('JsonSecretEditor', () => {
  it('reports validation accessibly and delegates formatting', async () => {
    const user = userEvent.setup();
    const onFormat = vi.fn();
    render(
      <JsonSecretEditor
        value="{"
        onChange={vi.fn()}
        onFormat={onFormat}
        validationError="JSON syntax error."
      />,
    );

    expect(screen.getByLabelText('Secret JSON editor')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('JSON syntax error.');
    await user.click(screen.getByRole('button', { name: 'Format' }));
    expect(onFormat).toHaveBeenCalledOnce();
  });

  it('inserts two spaces on Tab and updates the cursor status', async () => {
    const onChange = vi.fn();
    render(<JsonSecretEditor value="{}" onChange={onChange} onFormat={vi.fn()} />);
    const editor = screen.getByLabelText('Secret JSON editor') as HTMLTextAreaElement;
    editor.focus();
    editor.setSelectionRange(1, 1);

    fireEvent.keyDown(editor, { key: 'Tab' });

    expect(onChange).toHaveBeenCalledWith('{  }');
    await waitFor(() => expect(screen.getByText('Ln 1, Col 4')).toBeVisible());
  });
});
