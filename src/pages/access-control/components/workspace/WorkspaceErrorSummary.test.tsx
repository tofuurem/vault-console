import {
  useState,
} from 'react';
import {
  render,
  screen,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import WorkspaceErrorSummary, {
  type WorkspaceValidationError,
} from './WorkspaceErrorSummary';

const nameError: WorkspaceValidationError = {
  id: 'name',
  message: 'Enter a valid name.',
  step: 'overview',
  fieldId: 'name',
};
const accessError: WorkspaceValidationError = {
  id: 'access',
  message: 'Add an access target.',
  step: 'access',
};

function ValidationHarness() {
  const [value, setValue] = useState('');
  const errors = value ? [accessError] : [nameError, accessError];
  return (
    <>
      <WorkspaceErrorSummary errors={errors} onNavigate={() => undefined} />
      <label htmlFor="name">Name</label>
      <input
        id="name"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
    </>
  );
}

describe('WorkspaceErrorSummary', () => {
  it('does not steal focus while an edited field resolves one of several errors', async () => {
    const user = userEvent.setup();
    render(<ValidationHarness />);

    const input = screen.getByLabelText('Name');
    await user.type(input, 'billing-reader');

    expect(input).toHaveValue('billing-reader');
    expect(input).toHaveFocus();
    expect(screen.getByText('Resolve 1 issue before Review')).toBeVisible();
  });
});
