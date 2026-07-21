import { describe, expect, it } from 'vitest';

import {
  comparePolicyPatterns,
  matchesPolicyPattern,
  resolvePolicyAccess,
} from './policy-matcher';
import type { PolicyRule, PolicySource, VaultCapability } from './types';

const readerRole: PolicySource = { kind: 'role', id: 'reader', label: 'Platform reader' };
const editorGroup: PolicySource = {
  kind: 'group',
  id: 'platform-team',
  label: 'Platform team',
  via: 'editor',
};
const userOverride: PolicySource = { kind: 'user-rule', id: 'alice-1', label: 'Alice override' };

function rule(
  pattern: string,
  capabilities: readonly VaultCapability[],
  source: PolicySource = readerRole,
): PolicyRule {
  return { pattern, capabilities, source };
}

describe('matchesPolicyPattern', () => {
  it('matches exact, trailing glob, and single-segment wildcard paths', () => {
    expect(matchesPolicyPattern('secret/data/app', '/secret/data/app')).toBe(true);
    expect(matchesPolicyPattern('secret/data/app*', 'secret/data/application/config')).toBe(true);
    expect(matchesPolicyPattern('secret/+/app', 'secret/data/app')).toBe(true);
    expect(matchesPolicyPattern('secret/+/app', 'secret/data/nested/app')).toBe(false);
  });
});

describe('comparePolicyPatterns', () => {
  it('implements Vault wildcard and tie-break priority rules', () => {
    expect(comparePolicyPatterns('secret/data/app', 'secret/data/app*')).toBeGreaterThan(0);
    expect(comparePolicyPatterns('secret/data/app/+', 'secret/+/app/config')).toBeGreaterThan(0);
    expect(comparePolicyPatterns('secret/+/app/config', 'secret/+/+/config')).toBeGreaterThan(0);
    expect(comparePolicyPatterns('secret/+/longer', 'secret/+/short')).toBeGreaterThan(0);
    expect(comparePolicyPatterns('secret/+/beta', 'secret/+/able')).toBeGreaterThan(0);
  });
});

describe('resolvePolicyAccess', () => {
  it('unions capabilities and provenance for an identical selected pattern', () => {
    const result = resolvePolicyAccess('secret/data/app/config', [
      rule('secret/data/app/*', ['read']),
      rule('secret/data/app/*', ['update'], editorGroup),
    ]);

    expect(result.capabilities).toEqual(['read', 'update']);
    expect(result.sources).toEqual([readerRole, editorGroup]);
    expect(result.capabilitySources.read).toEqual([readerRole]);
    expect(result.capabilitySources.update).toEqual([editorGroup]);
  });

  it('uses only the highest-priority matching pattern', () => {
    const result = resolvePolicyAccess('secret/data/app/config', [
      rule('secret/data/*', ['update']),
      rule('secret/data/app/*', ['read'], editorGroup),
    ]);

    expect(result.matchedPattern).toBe('secret/data/app/*');
    expect(result.capabilities).toEqual(['read']);
    expect(result.sources).toEqual([editorGroup]);
  });

  it('lets deny win within the selected pattern', () => {
    const result = resolvePolicyAccess('secret/data/app/config', [
      rule('secret/data/app/*', ['read', 'update']),
      rule('secret/data/app/*', ['deny'], userOverride),
    ]);

    expect(result.denied).toBe(true);
    expect(result.capabilities).toEqual(['deny']);
    expect(result.capabilitySources.deny).toEqual([userOverride]);
  });

  it('does not allow a less-specific deny to override a more-specific grant', () => {
    const result = resolvePolicyAccess('secret/data/app/config', [
      rule('secret/data/*', ['deny'], userOverride),
      rule('secret/data/app/*', ['read']),
    ]);

    expect(result.denied).toBe(false);
    expect(result.capabilities).toEqual(['read']);
  });

  it('returns an empty resolution when no policy path matches', () => {
    expect(resolvePolicyAccess('secret/data/other', [rule('secret/data/app/*', ['read'])])).toEqual({
      requestPath: 'secret/data/other',
      matchedPattern: null,
      capabilities: [],
      denied: false,
      sources: [],
      capabilitySources: {},
    });
  });
});
