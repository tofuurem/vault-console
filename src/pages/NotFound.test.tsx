import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import App from '@/App';

describe('NotFound', () => {
  it('shows a production-safe recovery route with the unknown path', () => {
    window.history.replaceState({}, '', '/missing/vault/screen');
    render(<App />);

    expect(screen.getByRole('heading', {
      name: 'This Vault Console page does not exist',
    })).toBeVisible();
    expect(screen.getByText('/missing/vault/screen')).toBeVisible();
    expect(screen.getByRole('link', {
      name: 'Return to Vault Console',
    })).toHaveAttribute('href', '/');
    expect(screen.queryByText(/has not been generated/i)).not.toBeInTheDocument();
  });
});
