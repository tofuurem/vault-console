import {
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import AccessWorkspaceShell from './AccessWorkspaceShell';

const steps = [
  { id: 'overview', label: 'Overview', description: 'Resource identity' },
  { id: 'access', label: 'KV access', description: 'Paths and capabilities' },
  { id: 'review', label: 'Review', description: 'Apply plan' },
];

describe('AccessWorkspaceShell', () => {
  it('exposes keyboard-operable steps and focuses the workspace heading', async () => {
    const user = userEvent.setup();
    const onStepChange = vi.fn();
    render(
      <AccessWorkspaceShell
        eyebrow="Role change"
        title="Platform readers"
        subtitle="vc-role-platform-readers"
        steps={steps}
        activeStep="overview"
        onStepChange={onStepChange}
        onClose={vi.fn()}
        dirty={false}
        footer={<button type="button">Continue</button>}
      >
        <p>Editor body</p>
      </AccessWorkspaceShell>,
    );

    expect(screen.getByRole('heading', { name: 'Platform readers' })).toHaveFocus();
    expect(screen.getByRole('button', { name: /Overview/ })).toHaveAttribute(
      'aria-current',
      'step',
    );
    await user.click(screen.getByRole('button', { name: /KV access/ }));
    expect(onStepChange).toHaveBeenCalledWith('access');
  });

  it('guards dirty close and browser unload without trapping a clean workspace', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { rerender } = render(
      <AccessWorkspaceShell
        eyebrow="User change"
        title="Alice"
        steps={steps}
        activeStep="overview"
        onStepChange={vi.fn()}
        onClose={onClose}
        dirty
      >
        <p>Editor body</p>
      </AccessWorkspaceShell>,
    );

    await user.click(screen.getByRole('button', { name: 'Close access editor' }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();

    const event = new Event('beforeunload', { cancelable: true });
    fireEvent(window, event);
    expect(event.defaultPrevented).toBe(true);

    rerender(
      <AccessWorkspaceShell
        eyebrow="User change"
        title="Alice"
        steps={steps}
        activeStep="overview"
        onStepChange={vi.fn()}
        onClose={onClose}
        dirty={false}
      >
        <p>Editor body</p>
      </AccessWorkspaceShell>,
    );
    await user.click(screen.getByRole('button', { name: 'Close access editor' }));
    expect(onClose).toHaveBeenCalledOnce();
    confirm.mockRestore();
  });
});
