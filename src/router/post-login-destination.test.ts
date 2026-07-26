import { describe, expect, it } from 'vitest';

import { postLoginDestination } from './post-login-destination';

describe('postLoginDestination', () => {
  it('preserves an internal route with query and fragment', () => {
    expect(postLoginDestination({
      from: '/explorer/applications?secret=team%2Fapi#versions',
    })).toBe('/explorer/applications?secret=team%2Fapi#versions');
  });

  it.each([
    undefined,
    { from: 'https://attacker.example' },
    { from: '//attacker.example/path' },
    { from: '/\\attacker.example/path' },
  ])('falls back for missing or non-local destinations', (state) => {
    expect(postLoginDestination(state)).toBe('/explorer');
  });
});
