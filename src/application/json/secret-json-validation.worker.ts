import { parseSecretJson } from '@/domain/vault/secret-json';
import type {
  SecretJsonValidationRequest,
  SecretJsonValidationResponse,
} from './secret-json-validation';

interface JsonValidationWorkerScope {
  onmessage: ((event: MessageEvent<SecretJsonValidationRequest>) => void) | null;
  postMessage(message: SecretJsonValidationResponse): void;
}

const workerScope = globalThis as unknown as JsonValidationWorkerScope;

workerScope.onmessage = (event) => {
  workerScope.postMessage({
    id: event.data.id,
    result: parseSecretJson(event.data.source),
  });
};
