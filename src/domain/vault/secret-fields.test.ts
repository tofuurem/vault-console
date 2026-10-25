import { describe, expect, it } from 'vitest';

import {
  isFlatStringSecret,
  secretDataFromFields,
  secretFieldErrors,
  secretFieldsFromData,
} from './secret-fields';

describe('secret fields', () => {
  it('accepts only documents whose values are all strings', () => {
    expect(isFlatStringSecret({ user: 'svc', password: 'x' })).toBe(true);
    expect(isFlatStringSecret({ port: 5432 })).toBe(false);
    expect(isFlatStringSecret({ options: { ssl: true } })).toBe(false);
    expect(isFlatStringSecret({})).toBe(true);
  });

  it('round-trips a flat document and trims keys but not values', () => {
    const fields = secretFieldsFromData({ user: 'svc', password: ' keep spaces ' });
    expect(fields.map(({ key, value }) => [key, value])).toEqual([
      ['user', 'svc'],
      ['password', ' keep spaces '],
    ]);
    expect(secretDataFromFields([
      ...fields,
      { id: -1, key: '  token ', value: 't' },
      { id: -2, key: '', value: '' },
    ])).toEqual({ user: 'svc', password: ' keep spaces ', token: 't' });
  });

  it('starts an empty document with one blank row', () => {
    expect(secretFieldsFromData({})).toHaveLength(1);
  });

  it('reports missing keys, duplicates, and empty documents', () => {
    expect(secretFieldErrors([{ id: 1, key: '', value: '' }])).toEqual(['Add at least one key/value pair.']);
    expect(secretFieldErrors([{ id: 1, key: '', value: 'orphan' }])).toEqual(['Every value needs a key.']);
    expect(secretFieldErrors([
      { id: 1, key: 'a', value: '1' },
      { id: 2, key: ' a ', value: '2' },
    ])).toEqual(['Secret keys must be unique.']);
    expect(secretFieldErrors([{ id: 1, key: 'a', value: '' }])).toEqual([]);
  });
});
