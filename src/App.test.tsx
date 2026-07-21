import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import App from './App';

describe('App', () => {
  it('renders the Vault Console login surface', () => {
    window.history.replaceState({}, '', '/');

    render(<App />);

    expect(screen.getByRole('heading', { name: 'Vault Console' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });
});
