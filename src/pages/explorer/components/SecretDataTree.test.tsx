import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import SecretDataTree from './SecretDataTree';

const nestedData = {
  service: {
    credentials: {
      access: 'alpha-value',
      enabled: true,
    },
    ports: [443, 8443],
  },
  fallback: null,
};

describe('SecretDataTree', () => {
  it('renders nested containers while keeping primitive values masked', async () => {
    const user = userEvent.setup();
    render(<SecretDataTree data={nestedData} />);

    expect(screen.getByRole('button', { name: 'Collapse service' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('credentials')).toBeVisible();
    expect(screen.getAllByText('••••••••').length).toBeGreaterThan(0);
    expect(screen.queryByText('alpha-value')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reveal service/credentials/access' }));
    expect(screen.getByText('alpha-value')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Collapse service' }));
    expect(screen.queryByText('credentials')).not.toBeInTheDocument();
  });

  it('reveals all primitive values only when explicitly requested', () => {
    const { rerender } = render(<SecretDataTree data={nestedData} />);
    expect(screen.queryByText('8443')).not.toBeInTheDocument();

    rerender(<SecretDataTree data={nestedData} revealAll />);
    expect(screen.getByText('8443')).toBeVisible();
    expect(screen.getByText('true')).toBeVisible();
  });
});
