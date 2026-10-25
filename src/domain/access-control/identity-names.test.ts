import { describe, expect, it } from 'vitest';

import { identityTitle, isGeneratedEntityName } from './identity-names';

describe('identity names', () => {
  it('recognizes names Vault generates for implicit entities', () => {
    expect(isGeneratedEntityName('entity_e13c6c2b')).toBe(true);
    expect(isGeneratedEntityName('Maria Kowalska')).toBe(false);
    expect(isGeneratedEntityName('entity_payments')).toBe(false);
  });

  it('titles generated entities by their login name', () => {
    expect(identityTitle('entity_e13c6c2b', 'admin')).toBe('admin');
    expect(identityTitle('Maria Kowalska', 'maria.k')).toBe('Maria Kowalska');
    expect(identityTitle('', 'maria.k')).toBe('maria.k');
  });
});
