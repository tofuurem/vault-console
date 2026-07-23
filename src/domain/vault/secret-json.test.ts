import { describe, expect, it } from 'vitest';

import {
  formatSecretJson,
  hasNestedSecretData,
  parseSecretJson,
  redactSecretValue,
  secretContainerSize,
  secretValueType,
  summarizeSecretChanges,
} from './secret-json';

describe('secret JSON helpers', () => {
  it('parses a nested object without changing JSON value types', () => {
    const result = parseSecretJson('{"service":{"ports":[443,8443],"enabled":true},"fallback":null}');

    expect(result).toEqual({
      ok: true,
      data: {
        service: { ports: [443, 8443], enabled: true },
        fallback: null,
      },
    });
  });

  it('rejects malformed JSON without returning source content in the message', () => {
    const result = parseSecretJson('{"token":"do-not-echo",}');

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.kind).toBe('syntax');
      expect(result.message).toMatch(/^JSON syntax error/);
      expect(result.message).not.toContain('do-not-echo');
    }
  });

  it.each(['[]', 'null', '"value"', '42'])('rejects a non-object root: %s', (source) => {
    expect(parseSecretJson(source)).toEqual({
      ok: false,
      kind: 'root',
      message: 'Secret JSON must have an object at the root.',
    });
  });

  it('redacts recursively without mutating the original structure', () => {
    const source = {
      service: { token: 'actual', retries: 3, active: true, fallback: null },
      hosts: ['one', 'two'],
    };

    expect(redactSecretValue(source)).toEqual({
      service: { token: '••••••••', retries: 0, active: false, fallback: null },
      hosts: ['••••••••', '••••••••'],
    });
    expect(source.service.token).toBe('actual');
  });

  it('detects containers, reports types and formats stable JSON', () => {
    const data = { flat: 'value', nested: { enabled: true }, list: [1, 2] };

    expect(hasNestedSecretData(data)).toBe(true);
    expect(hasNestedSecretData({ flat: 'value', enabled: true })).toBe(false);
    expect(secretValueType(data.nested)).toBe('object');
    expect(secretValueType(data.list)).toBe('array');
    expect(secretContainerSize(data.nested)).toBe(1);
    expect(secretContainerSize(data.list)).toBe(2);
    expect(formatSecretJson(data)).toContain('\n  "nested": {');
  });

  it('summarizes top-level changes without exposing their values', () => {
    expect(summarizeSecretChanges(
      { keep: 'same', change: { old: true }, remove: 'gone' },
      { keep: 'same', change: { old: false }, add: ['new'] },
    )).toEqual({ added: 1, changed: 1, removed: 1 });
  });
});
