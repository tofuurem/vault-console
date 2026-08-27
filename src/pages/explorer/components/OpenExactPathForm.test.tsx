import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import OpenExactPathForm from './OpenExactPathForm';

describe('OpenExactPathForm', () => {
  it('normalizes and submits a valid logical path', () => {
    const onOpen = vi.fn();
    render(<OpenExactPathForm mount="applications" onOpen={onOpen} />);

    fireEvent.change(screen.getByLabelText('Secret path relative to applications'), {
      target: { value: ' /team/database ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open exact path' }));

    expect(onOpen).toHaveBeenCalledWith('team/database');
  });

  it('keeps invalid folder and relative paths on the form', () => {
    const onOpen = vi.fn();
    render(<OpenExactPathForm mount="applications" onOpen={onOpen} />);

    fireEvent.change(screen.getByLabelText('Secret path relative to applications'), {
      target: { value: 'team/../database' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open exact path' }));

    expect(screen.getByText('Relative path segments are not allowed.')).toBeVisible();
    expect(onOpen).not.toHaveBeenCalled();
  });
});
