import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { SecretJsonParseResult } from '@/domain/vault/secret-json';
import { parseSecretJson } from '@/domain/vault/secret-json';
import {
  isLargeSecretJson,
  SECRET_JSON_VALIDATION_DELAY_MS,
  validateSecretJsonInBackground,
} from './secret-json-validation';

type ValidationStatus = 'idle' | 'pending' | 'valid' | 'invalid';

interface ValidationSnapshot {
  readonly source: string;
  readonly status: ValidationStatus;
  readonly result?: SecretJsonParseResult;
}

interface DeferredSecretJsonValidationOptions {
  readonly enabled?: boolean;
  readonly delayMs?: number;
  readonly validateInBackground?: (source: string) => Promise<SecretJsonParseResult>;
}

export interface DeferredSecretJsonValidation {
  readonly status: ValidationStatus;
  readonly result?: SecretJsonParseResult;
  readonly isLarge: boolean;
  readonly validateNow: () => SecretJsonParseResult;
}

function statusFor(result: SecretJsonParseResult): ValidationStatus {
  return result.ok ? 'valid' : 'invalid';
}

export function useDeferredSecretJsonValidation(
  source: string,
  {
    enabled = true,
    delayMs = SECRET_JSON_VALIDATION_DELAY_MS,
    validateInBackground = validateSecretJsonInBackground,
  }: DeferredSecretJsonValidationOptions = {},
): DeferredSecretJsonValidation {
  const revisionRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [snapshot, setSnapshot] = useState<ValidationSnapshot>({
    source,
    status: enabled ? 'pending' : 'idle',
  });
  const isLarge = useMemo(() => isLargeSecretJson(source), [source]);

  useEffect(() => {
    const revision = ++revisionRef.current;
    clearTimeout(timerRef.current);
    if (!enabled) {
      setSnapshot({ source, status: 'idle' });
      return;
    }

    setSnapshot({ source, status: 'pending' });
    timerRef.current = setTimeout(() => {
      void validateInBackground(source).then((result) => {
        if (revisionRef.current !== revision) return;
        setSnapshot({ source, status: statusFor(result), result });
      });
    }, delayMs);

    return () => clearTimeout(timerRef.current);
  }, [delayMs, enabled, source, validateInBackground]);

  const validateNow = useCallback(() => {
    ++revisionRef.current;
    clearTimeout(timerRef.current);
    const result = parseSecretJson(source);
    setSnapshot({ source, status: statusFor(result), result });
    return result;
  }, [source]);

  const currentSnapshot = snapshot.source === source
    ? snapshot
    : { source, status: enabled ? 'pending' as const : 'idle' as const };

  return {
    status: currentSnapshot.status,
    result: currentSnapshot.result,
    isLarge,
    validateNow,
  };
}
