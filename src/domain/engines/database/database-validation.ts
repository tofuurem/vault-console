import { durationError } from '@/domain/engines/engines';

/** Vault's `GenericNameRegex` for connection and role names. */
const NAME = /^\w(?:[\w.-]*\w)?$/;

export function databaseNameError(name: string, existing: readonly string[] = []): string | undefined {
  const trimmed = name.trim();
  if (!trimmed) return 'Enter a name.';
  if (!NAME.test(trimmed)) return 'Use letters, numbers, dots, dashes, or underscores, starting and ending with a letter or number.';
  if (existing.includes(trimmed)) return 'This name is already in use. Open it from the list to edit it.';
  return undefined;
}

export function isDatabaseName(name: string): boolean {
  return NAME.test(name);
}

const UNIT_SECONDS: Readonly<Record<string, number>> = {
  ns: 1e-9,
  us: 1e-6,
  'µs': 1e-6,
  ms: 1e-3,
  s: 1,
  m: 60,
  h: 3_600,
};

/** Seconds in a Vault duration (`1h30m`, `90s`, `3600`); undefined if empty or invalid. */
export function parseDurationSeconds(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed || durationError(trimmed)) return undefined;
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  let total = 0;
  for (const match of trimmed.matchAll(/(\d+(?:\.\d+)?)(ns|us|µs|ms|s|m|h)/g)) {
    total += Number(match[1]) * UNIT_SECONDS[match[2]];
  }
  return total;
}

export function ttlPairError(defaultTtl: string, maxTtl: string): string | undefined {
  const defaultSeconds = parseDurationSeconds(defaultTtl);
  const maxSeconds = parseDurationSeconds(maxTtl);
  if (defaultSeconds === undefined || maxSeconds === undefined || maxSeconds === 0) return undefined;
  return defaultSeconds > maxSeconds ? 'The default TTL cannot be longer than the max TTL.' : undefined;
}

const CRON_FIELD = /^[\d*/,?A-Za-z-]+$/;

/** Vault accepts standard five-field cron expressions for static role rotation. */
export function cronScheduleError(value: string): string | undefined {
  const fields = value.trim().split(/\s+/).filter(Boolean);
  if (fields.length === 0) return 'Enter a cron schedule, for example 0 3 * * SAT.';
  if (fields.length !== 5 || fields.some((field) => !CRON_FIELD.test(field))) {
    return 'Use five cron fields: minute, hour, day of month, month, day of week.';
  }
  return undefined;
}

/** Splits comma- or newline-separated input into unique, trimmed entries. */
export function parseNameList(text: string): readonly string[] {
  return [...new Set(text.split(/[,\n]/).map((entry) => entry.trim()).filter(Boolean))];
}

/**
 * Statements are edited as one block. Vault plugins split SQL on `;` and read
 * JSON statements whole, so a single list entry keeps both formats intact.
 */
export function statementsFromText(text: string): readonly string[] {
  const trimmed = text.trim();
  return trimmed ? [trimmed] : [];
}

export function statementsToText(statements: readonly string[]): string {
  return statements.join('\n');
}

/** Flags URLs that embed a literal password instead of the `{{password}}` template. */
export function connectionUrlWarning(url: string): string | undefined {
  const credentials = /\/\/([^/\s@]+)@/.exec(url)?.[1] ?? /^([^/\s@]+)@/.exec(url)?.[1];
  if (!credentials || !credentials.includes(':')) return undefined;
  if (credentials.includes('{{password}}')) return undefined;
  return 'This URL contains a literal password. Use {{username}} and {{password}} so Vault stores the password separately and can rotate it.';
}
