import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ContentSkeleton from './ContentSkeleton';

describe('ContentSkeleton', () => {
  it('announces content loading without relying on animated icon meaning', () => {
    render(<ContentSkeleton label="Loading Vault policies" variant="detail" />);

    expect(screen.getByRole('status', { name: 'Loading Vault policies' }))
      .toBeVisible();
    expect(screen.getByText('Loading Vault policies')).toHaveClass('sr-only');
  });
});
