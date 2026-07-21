import { VaultError } from '../../../domain/vault/errors';

export type JsonObject = Record<string, unknown>;

function invalidResponse(): never {
  throw new VaultError('invalid-response');
}

export function asObject(value: unknown): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return invalidResponse();
  return value as JsonObject;
}

export function asString(value: unknown): string {
  if (typeof value !== 'string') return invalidResponse();
  return value;
}

export function asNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return invalidResponse();
  return value;
}

export function asBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean') return invalidResponse();
  return value;
}

export function asArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) return invalidResponse();
  return value;
}

export function optionalBoolean(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null) return fallback;
  return asBoolean(value);
}

export function asStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) return invalidResponse();
  return value;
}

export function asStringRecord(value: unknown): Readonly<Record<string, string>> {
  const object = asObject(value);
  if (Object.values(object).some((item) => typeof item !== 'string')) return invalidResponse();
  return object as Record<string, string>;
}

export function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return asString(value);
}

export function optionalStringArray(value: unknown): readonly string[] {
  if (value === undefined || value === null) return [];
  return asStringArray(value);
}

export function optionalStringRecord(value: unknown): Readonly<Record<string, string>> {
  if (value === undefined || value === null) return {};
  return asStringRecord(value);
}
