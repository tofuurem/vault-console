import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import Tabs from './Tabs';

function TabsFixture() {
  const [active, setActive] = useState('details');
  return (
    <Tabs
      tabs={[{ key: 'details', label: 'Details' }, { key: 'versions', label: 'Versions' }]}
      activeTab={active}
      onChange={setActive}
    >
      <p>{active} content</p>
    </Tabs>
  );
}

describe('Tabs', () => {
  it('exposes tab semantics and supports arrow-key navigation', async () => {
    const user = userEvent.setup();
    render(<TabsFixture />);

    const details = screen.getByRole('tab', { name: 'Details' });
    details.focus();
    await user.keyboard('{ArrowRight}');

    expect(screen.getByRole('tab', { name: 'Versions' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Versions' })).toHaveFocus();
    expect(screen.getByRole('tabpanel')).toHaveTextContent('versions content');
  });
});
