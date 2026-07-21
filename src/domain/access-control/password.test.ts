import { describe, expect, it } from 'vitest';

import { assessPassword, generateSecurePassword } from './password';

describe('generateSecurePassword', () => {
  it('creates a constrained password with every required character class', () => {
    const password = generateSecurePassword(32);

    expect(password).toHaveLength(32);
    expect(password).toMatch(/[A-Z]/);
    expect(password).toMatch(/[a-z]/);
    expect(password).toMatch(/\d/);
    expect(password).toMatch(/[!@#$%&*_\-+=]/);
  });

  it('does not produce a stable or Math.random-derived fixture', () => {
    const generated = new Set(Array.from({ length: 8 }, () => generateSecurePassword()));
    expect(generated.size).toBe(8);
  });

  it('rejects unsafe lengths', () => {
    expect(() => generateSecurePassword(15)).toThrow(/between 16 and 128/);
  });
});

describe('assessPassword', () => {
  it('rates a generated default password as strong or excellent', () => {
    expect(['Strong', 'Excellent']).toContain(assessPassword(generateSecurePassword()).label);
  });
});
