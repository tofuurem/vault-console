import type { SecretJsonParseResult } from '@/domain/vault/secret-json';
import { parseSecretJson } from '@/domain/vault/secret-json';

export const LARGE_SECRET_JSON_BYTES = 512 * 1024;
export const SECRET_JSON_VALIDATION_DELAY_MS = 250;

export interface SecretJsonValidationRequest {
  readonly id: number;
  readonly source: string;
}

export interface SecretJsonValidationResponse {
  readonly id: number;
  readonly result: SecretJsonParseResult;
}

interface ValidationWorker {
  postMessage(message: SecretJsonValidationRequest): void;
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<SecretJsonValidationResponse>) => void,
  ): void;
  addEventListener(type: 'error', listener: () => void): void;
  terminate(): void;
}

type ValidationWorkerFactory = () => ValidationWorker | null;

interface PendingValidation {
  readonly source: string;
  readonly resolve: (result: SecretJsonParseResult) => void;
}

export interface SecretJsonValidationClient {
  validate(source: string): Promise<SecretJsonParseResult>;
  dispose(): void;
}

function defaultWorkerFactory(): ValidationWorker | null {
  if (typeof Worker === 'undefined') return null;
  return new Worker(
    new URL('./secret-json-validation.worker.ts', import.meta.url),
    { type: 'module', name: 'vault-console-json-validation' },
  );
}

function deferredMainThreadValidation(source: string): Promise<SecretJsonParseResult> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(parseSecretJson(source)), 0);
  });
}

export function secretJsonUtf8Bytes(source: string): number {
  return new TextEncoder().encode(source).byteLength;
}

export function isLargeSecretJson(source: string): boolean {
  if (source.length > LARGE_SECRET_JSON_BYTES) return true;
  return secretJsonUtf8Bytes(source) > LARGE_SECRET_JSON_BYTES;
}

export function createSecretJsonValidationClient(
  workerFactory: ValidationWorkerFactory = defaultWorkerFactory,
): SecretJsonValidationClient {
  let nextRequestId = 0;
  let worker: ValidationWorker | null;
  const pending = new Map<number, PendingValidation>();

  try {
    worker = workerFactory();
  } catch {
    worker = null;
  }

  const fallBackToMainThread = () => {
    worker?.terminate();
    worker = null;
    for (const [id, validation] of pending) {
      pending.delete(id);
      void deferredMainThreadValidation(validation.source).then(validation.resolve);
    }
  };

  worker?.addEventListener('message', (event) => {
    const validation = pending.get(event.data.id);
    if (!validation) return;
    pending.delete(event.data.id);
    validation.resolve(event.data.result);
  });
  worker?.addEventListener('error', fallBackToMainThread);

  return {
    validate(source) {
      if (!worker) return deferredMainThreadValidation(source);
      const id = ++nextRequestId;
      return new Promise((resolve) => {
        pending.set(id, { source, resolve });
        worker?.postMessage({ id, source });
      });
    },
    dispose() {
      fallBackToMainThread();
    },
  };
}

let sharedClient: SecretJsonValidationClient | undefined;

export function validateSecretJsonInBackground(source: string): Promise<SecretJsonParseResult> {
  sharedClient ??= createSecretJsonValidationClient();
  return sharedClient.validate(source);
}
