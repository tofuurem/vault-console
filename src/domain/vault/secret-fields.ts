import type { SecretJsonObject } from './secret-json';

export interface SecretField {
  readonly id: number;
  readonly key: string;
  readonly value: string;
}

let nextFieldId = 0;

export function emptySecretField(): SecretField {
  nextFieldId += 1;
  return { id: nextFieldId, key: '', value: '' };
}

/** True when every value is a string, so the document fits a key/value form. */
export function isFlatStringSecret(data: SecretJsonObject): data is Readonly<Record<string, string>> {
  return Object.values(data).every((value) => typeof value === 'string');
}

export function secretFieldsFromData(data: Readonly<Record<string, string>>): readonly SecretField[] {
  const fields = Object.entries(data).map(([key, value]) => ({ ...emptySecretField(), key, value }));
  return fields.length > 0 ? fields : [emptySecretField()];
}

function filledFields(fields: readonly SecretField[]): readonly SecretField[] {
  return fields.filter((field) => field.key.trim() || field.value);
}

export function secretFieldErrors(fields: readonly SecretField[]): readonly string[] {
  const filled = filledFields(fields);
  const errors: string[] = [];
  if (filled.length === 0) errors.push('Add at least one key/value pair.');
  if (filled.some((field) => !field.key.trim())) errors.push('Every value needs a key.');
  const keys = filled.map((field) => field.key.trim()).filter(Boolean);
  if (new Set(keys).size !== keys.length) errors.push('Secret keys must be unique.');
  return errors;
}

export function secretDataFromFields(fields: readonly SecretField[]): Readonly<Record<string, string>> {
  return Object.fromEntries(
    filledFields(fields)
      .filter((field) => field.key.trim())
      .map((field) => [field.key.trim(), field.value]),
  );
}
