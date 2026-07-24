import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import Tooltip from './Tooltip';

describe('Tooltip', () => {
  it('associates focus help with its trigger and dismisses it with Escape', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Permanently removes this version">
        <button type="button">Destroy</button>
      </Tooltip>,
    );

    const trigger = screen.getByRole('button', { name: 'Destroy' });
    await user.tab();
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('Permanently removes this version');
    expect(trigger).toHaveAttribute('aria-describedby', tooltip.id);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(trigger).not.toHaveAttribute('aria-describedby');
  });
});
