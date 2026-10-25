import { describe, expect, it } from 'vitest';

import {
  kvGetCliCommand,
  secretEnvExport,
  secretEnvExportBlocker,
  secretEnvExportBlockerMessage,
  secretJsonExport,
  secretLogicalPath,
  shellQuote,
} from './secret-export';

describe('secret export helpers', () => {
  it('builds the logical path and a shell-safe CLI command', () => {
    expect(secretLogicalPath('applications/', 'billing/database')).toBe('applications/billing/database');
    expect(kvGetCliCommand('applications', 'billing/database')).toBe(
      'vault kv get -mount=applications billing/database',
    );
    expect(kvGetCliCommand('team apps', "o'brien/db")).toBe(
      `vault kv get '-mount=team apps' 'o'\\''brien/db'`,
    );
    expect(shellQuote('$(rm -rf)')).toBe(`'$(rm -rf)'`);
  });

  it('exports flat string fields as .env lines with quoting only where needed', () => {
    const result = secretEnvExport({
      API_KEY: 'abc123',
      EMPTY: '',
      SPACED: 'hello world',
      QUOTED: "it's $HOME",
      MULTILINE: 'line1\nline2',
    });
    expect(result).toEqual({
      ok: true,
      text: [
        'API_KEY=abc123',
        'EMPTY=',
        "SPACED='hello world'",
        'QUOTED="it\'s \\$HOME"',
        'MULTILINE="line1\\nline2"',
        '',
      ].join('\n'),
    });
  });

  it('blocks .env export for nested, non-string, invalid-key, or empty data without exposing values', () => {
    expect(secretEnvExportBlocker({ PORT: 5432 })).toEqual({ reason: 'not-string', key: 'PORT' });
    expect(secretEnvExportBlocker({ CONFIG: { token: 'nested-secret' } })).toEqual({ reason: 'not-string', key: 'CONFIG' });
    expect(secretEnvExportBlocker({ 'api-key': 'x' })).toEqual({ reason: 'invalid-key', key: 'api-key' });
    expect(secretEnvExportBlocker({})).toEqual({ reason: 'empty' });

    const blocked = secretEnvExport({ CONFIG: { token: 'nested-secret' } });
    expect(blocked.ok).toBe(false);
    expect(JSON.stringify(blocked)).not.toContain('nested-secret');
    if (!blocked.ok) {
      expect(secretEnvExportBlockerMessage(blocked.blocker)).toContain('"CONFIG"');
      expect(secretEnvExportBlockerMessage(blocked.blocker)).not.toContain('nested-secret');
    }
  });

  it('exports JSON with stable formatting', () => {
    expect(secretJsonExport({ a: 'b', n: 1 })).toBe('{\n  "a": "b",\n  "n": 1\n}');
  });
});
