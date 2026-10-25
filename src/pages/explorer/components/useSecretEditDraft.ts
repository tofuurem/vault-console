import { useCallback, useMemo, useState } from 'react';

import { useDeferredSecretJsonValidation } from '@/application/json/useDeferredSecretJsonValidation';
import {
  isFlatStringSecret,
  secretDataFromFields,
  secretFieldErrors,
  secretFieldsFromData,
  type SecretField,
} from '@/domain/vault/secret-fields';
import {
  formatSecretJson,
  summarizeSecretChanges,
  type SecretJsonObject,
} from '@/domain/vault/secret-json';

export type SecretEditorMode = 'fields' | 'json';

export type SecretDraftCheck =
  | { readonly ok: true; readonly data: SecretJsonObject }
  | { readonly ok: false; readonly reason: 'fields'; readonly messages: readonly string[] }
  | { readonly ok: false; readonly reason: 'json' };

const NO_CHANGES = { added: 0, changed: 0, removed: 0 } as const;
const EMPTY_DOCUMENT_ERROR = 'Add at least one key/value pair.';

/**
 * Edits one secret version as either flat key/value fields or raw JSON. The
 * fields view is offered only while every value is a string, so switching
 * never coerces numbers, booleans, or nested data.
 */
export function useSecretEditDraft(original: SecretJsonObject | undefined, active: boolean) {
  const [mode, setMode] = useState<SecretEditorMode>('json');
  const [rawJson, setRawJson] = useState('{}');
  const [initialJson, setInitialJson] = useState('{}');
  const [fields, setFields] = useState<readonly SecretField[]>([]);
  const [modeNotice, setModeNotice] = useState('');
  const validation = useDeferredSecretJsonValidation(rawJson, { enabled: active && mode === 'json' });

  const reset = useCallback((data: SecretJsonObject) => {
    const formatted = formatSecretJson(data);
    setRawJson(formatted);
    setInitialJson(formatted);
    setModeNotice('');
    if (isFlatStringSecret(data)) {
      setFields(secretFieldsFromData(data));
      setMode('fields');
    } else {
      setFields([]);
      setMode('json');
    }
  }, []);

  const fieldsData = useMemo(() => secretDataFromFields(fields), [fields]);
  const fieldErrors = mode === 'fields' ? secretFieldErrors(fields) : [];
  const currentJson = mode === 'fields' ? formatSecretJson(fieldsData) : rawJson;
  const dirty = currentJson !== initialJson;
  const currentData = mode === 'fields'
    ? fieldsData
    : validation.result?.ok ? validation.result.data : undefined;
  const changes = useMemo(
    () => (original && currentData ? summarizeSecretChanges(original, currentData) : NO_CHANGES),
    [currentData, original],
  );

  const switchMode = (next: SecretEditorMode) => {
    if (next === mode) return;
    if (next === 'json') {
      const blocking = fieldErrors.filter((message) => message !== EMPTY_DOCUMENT_ERROR);
      if (blocking.length > 0) {
        setModeNotice(`Resolve the fields first: ${blocking.join(' ')}`);
        return;
      }
      setRawJson(formatSecretJson(fieldsData));
      setMode('json');
      setModeNotice('');
      return;
    }
    const exact = validation.validateNow();
    if (!exact.ok) {
      setModeNotice('Fix the JSON error before switching to fields.');
      return;
    }
    if (!isFlatStringSecret(exact.data)) {
      setModeNotice('Nested, numeric, and boolean values can only be edited as JSON.');
      return;
    }
    setFields(secretFieldsFromData(exact.data));
    setMode('fields');
    setModeNotice('');
  };

  const check = (): SecretDraftCheck => {
    if (mode === 'fields') {
      return fieldErrors.length > 0
        ? { ok: false, reason: 'fields', messages: fieldErrors }
        : { ok: true, data: fieldsData };
    }
    const exact = validation.validateNow();
    return exact.ok ? { ok: true, data: exact.data } : { ok: false, reason: 'json' };
  };

  const formatJson = () => {
    const exact = validation.validateNow();
    if (exact.ok) setRawJson(formatSecretJson(exact.data));
  };

  return {
    mode,
    switchMode,
    modeNotice,
    fields,
    setFields,
    rawJson,
    setRawJson,
    formatJson,
    validation,
    dirty,
    changes,
    reset,
    check,
  };
}

export type SecretEditDraft = ReturnType<typeof useSecretEditDraft>;
