import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import type { SecretField } from '@/domain/vault/secret-fields';
import SecretFieldsEditor from './SecretFieldsEditor';

function Harness({ initial }: { readonly initial: readonly SecretField[] }) {
  const [fields, setFields] = useState(initial);
  return <SecretFieldsEditor fields={fields} onChange={setFields} />;
}

describe('SecretFieldsEditor', () => {
  it('masks values until revealed and generates a strong password in place', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[{ id: 1, key: 'PASSWORD', value: 'old' }]} />);

    const value = screen.getByLabelText('Value for PASSWORD');
    expect(value).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show value for PASSWORD' }));
    expect(value).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: 'Generate password for PASSWORD' }));
    const generated = (value as HTMLInputElement).value;
    expect(generated).toHaveLength(32);
    expect(generated).not.toBe('old');
    expect(document.body.textContent).not.toContain(generated);
  });
});
