import { formatSecretJson, type SecretJsonObject } from './secret-json';

/** Characters that never need quoting in a POSIX shell word. */
const SHELL_SAFE = /^[A-Za-z0-9_@%+=:,./-]+$/;
const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ENV_BARE_VALUE = /^[A-Za-z0-9_@%+=:,./-]*$/;

export function secretLogicalPath(mount: string, path: string): string {
  return `${mount.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

export function shellQuote(value: string): string {
  if (SHELL_SAFE.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** The Vault CLI command that reads the current version of a KV v2 secret. */
export function kvGetCliCommand(mount: string, path: string): string {
  const normalizedMount = mount.replace(/\/+$/, '');
  return `vault kv get ${shellQuote(`-mount=${normalizedMount}`)} ${shellQuote(path.replace(/^\/+/, ''))}`;
}

export type SecretEnvExportBlocker =
  | { readonly reason: 'empty' }
  | { readonly reason: 'invalid-key'; readonly key: string }
  | { readonly reason: 'not-string'; readonly key: string };

export type SecretEnvExport =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly blocker: SecretEnvExportBlocker };

/**
 * Reports why a secret cannot be represented as `.env` without reading any
 * value. Only the key name is returned, never the value.
 */
export function secretEnvExportBlocker(data: SecretJsonObject): SecretEnvExportBlocker | undefined {
  const entries = Object.entries(data);
  if (entries.length === 0) return { reason: 'empty' };
  for (const [key, value] of entries) {
    if (!ENV_KEY.test(key)) return { reason: 'invalid-key', key };
    if (typeof value !== 'string') return { reason: 'not-string', key };
  }
  return undefined;
}

export function secretEnvExportBlockerMessage(blocker: SecretEnvExportBlocker): string {
  if (blocker.reason === 'empty') return 'This version has no fields to export.';
  if (blocker.reason === 'invalid-key') {
    return `Field "${blocker.key}" is not a valid environment variable name.`;
  }
  return `Field "${blocker.key}" is not a plain text value. Only flat text fields can be exported as .env.`;
}

function envValue(value: string): string {
  if (ENV_BARE_VALUE.test(value)) return value;
  if (!value.includes("'") && !/[\r\n]/.test(value)) return `'${value}'`;
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/`/g, '\\`')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
  return `"${escaped}"`;
}

/** KEY=value lines; values are quoted only when a dotenv parser needs it. */
export function secretEnvExport(data: SecretJsonObject): SecretEnvExport {
  const blocker = secretEnvExportBlocker(data);
  if (blocker) return { ok: false, blocker };
  const lines = Object.entries(data).map(([key, value]) => `${key}=${envValue(value as string)}`);
  return { ok: true, text: `${lines.join('\n')}\n` };
}

export function secretJsonExport(data: SecretJsonObject): string {
  return formatSecretJson(data);
}
