import { describe, expect, it } from 'vitest';

import { loadSessionPreferences, saveSessionPreferences } from './session-preferences';

describe('session preferences', () => {
  it('defaults to manual renewal and round-trips the auto-renew choice', () => {
    window.localStorage.clear();
    expect(loadSessionPreferences(window.localStorage)).toEqual({ autoRenew: false });
    expect(saveSessionPreferences(window.localStorage, { autoRenew: true })).toBe(true);
    expect(loadSessionPreferences(window.localStorage)).toEqual({ autoRenew: true });
  });

  it('ignores malformed or unavailable storage', () => {
    window.localStorage.setItem('vc-console:session-preferences:v1', '{bad');
    expect(loadSessionPreferences(window.localStorage)).toEqual({ autoRenew: false });
    expect(loadSessionPreferences(null)).toEqual({ autoRenew: false });
    expect(saveSessionPreferences(null, { autoRenew: true })).toBe(false);
  });
});
