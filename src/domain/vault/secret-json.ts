import { parser as jsonParser } from '@lezer/json';

export type SecretJsonObject = Readonly<Record<string, unknown>>;

export interface SecretJsonLocation {
  readonly line: number;
  readonly column: number;
  readonly offset: number;
}

export type SecretJsonParseResult =
  | { readonly ok: true; readonly data: SecretJsonObject }
  | {
      readonly ok: false;
      readonly kind: 'syntax' | 'root';
      readonly message: string;
      readonly location?: SecretJsonLocation;
    };

export interface SecretChangeSummary {
  readonly added: number;
  readonly changed: number;
  readonly removed: number;
}

export type SecretValueType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';

export function isSecretJsonObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function secretValueType(value: unknown): SecretValueType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'string';
}

export function secretContainerSize(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (isSecretJsonObject(value)) return Object.keys(value).length;
  return 0;
}

export function hasNestedSecretData(data: SecretJsonObject): boolean {
  return Object.values(data).some((value) => Array.isArray(value) || isSecretJsonObject(value));
}

function offsetLocation(source: string, offset: number): SecretJsonLocation {
  const boundedOffset = Math.max(0, Math.min(offset, source.length));
  const before = source.slice(0, boundedOffset);
  const lines = before.split('\n');
  return {
    line: lines.length,
    column: (lines.at(-1)?.length ?? 0) + 1,
    offset: boundedOffset,
  };
}

function parserErrorOffset(source: string): number | undefined {
  let firstError: number | undefined;
  jsonParser.parse(source).cursor().iterate((node) => {
    if (firstError === undefined && node.type.isError) firstError = node.from;
  });
  return firstError;
}

function syntaxLocation(source: string, cause: unknown): SecretJsonLocation {
  const message = cause instanceof Error ? cause.message : '';
  const lineColumn = message.match(/line\s+(\d+)\s+column\s+(\d+)/i);
  if (lineColumn) {
    const line = Number(lineColumn[1]);
    const column = Number(lineColumn[2]);
    const lines = source.split('\n');
    const offset = lines
      .slice(0, Math.max(0, line - 1))
      .reduce((total, value) => total + value.length + 1, 0) + Math.max(0, column - 1);
    return offsetLocation(source, offset);
  }
  const position = message.match(/position\s+(\d+)/i)?.[1];
  if (position !== undefined) return offsetLocation(source, Number(position));
  if (/end of json/i.test(message)) return offsetLocation(source, source.length);
  return offsetLocation(source, parserErrorOffset(source) ?? 0);
}

function syntaxReason(source: string, location: SecretJsonLocation): string {
  if (location.offset >= source.length) return 'unexpected end of document';
  const token = source[location.offset];
  if (token === ',') return 'unexpected comma or missing value';
  if (token === '}' || token === ']') return 'unexpected closing delimiter or trailing comma';
  return 'unexpected or missing JSON token';
}

export function parseSecretJson(source: string): SecretJsonParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (cause) {
    const location = syntaxLocation(source, cause);
    return {
      ok: false,
      kind: 'syntax',
      message: `JSON syntax error at line ${location.line}, column ${location.column}: ${syntaxReason(source, location)}.`,
      location,
    };
  }

  if (!isSecretJsonObject(parsed)) {
    return {
      ok: false,
      kind: 'root',
      message: 'Secret JSON must have an object at the root.',
      location: offsetLocation(source, 0),
    };
  }
  return { ok: true, data: parsed };
}

export function formatSecretJson(data: SecretJsonObject): string {
  return JSON.stringify(data, null, 2);
}

export function redactSecretValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecretValue);
  if (isSecretJsonObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, redactSecretValue(child)]));
  }
  if (value === null) return null;
  if (typeof value === 'number') return 0;
  if (typeof value === 'boolean') return false;
  return '••••••••';
}

export function summarizeSecretChanges(
  before: SecretJsonObject,
  after: SecretJsonObject,
): SecretChangeSummary {
  const beforeKeys = Object.keys(before);
  const afterKeys = Object.keys(after);
  return {
    added: afterKeys.filter((key) => !beforeKeys.includes(key)).length,
    changed: afterKeys.filter((key) => (
      beforeKeys.includes(key) && JSON.stringify(before[key]) !== JSON.stringify(after[key])
    )).length,
    removed: beforeKeys.filter((key) => !afterKeys.includes(key)).length,
  };
}
