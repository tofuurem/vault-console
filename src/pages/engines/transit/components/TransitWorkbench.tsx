import type { ComponentType } from 'react';

import type { TransitKey } from '@/domain/engines/transit/transit';
import {
  TRANSIT_OPERATIONS,
  transitKeyOperations,
  type TransitOperation,
} from '@/domain/engines/transit/transit-key-types';
import DataKeyForm from './operations/DataKeyForm';
import DecryptForm from './operations/DecryptForm';
import EncryptForm from './operations/EncryptForm';
import HmacForm from './operations/HmacForm';
import type { OperationFormProps } from './operations/operation-props';
import RewrapForm from './operations/RewrapForm';
import SignForm from './operations/SignForm';
import VerifyForm from './operations/VerifyForm';
import VerifyHmacForm from './operations/VerifyHmacForm';

const FORMS: Readonly<Record<TransitOperation, ComponentType<OperationFormProps>>> = {
  encrypt: EncryptForm,
  decrypt: DecryptForm,
  rewrap: RewrapForm,
  datakey: DataKeyForm,
  sign: SignForm,
  verify: VerifyForm,
  hmac: HmacForm,
  'verify-hmac': VerifyHmacForm,
};

const DESCRIPTIONS: Readonly<Record<TransitOperation, string>> = {
  encrypt: 'Encrypt data with this key. Vault returns ciphertext; the key never leaves Vault.',
  decrypt: 'Decrypt ciphertext that was produced by this key.',
  rewrap: 'Move ciphertext to a newer key version without exposing the plaintext.',
  datakey: 'Create a data key for encrypting large data locally.',
  sign: 'Sign a message with the private key.',
  verify: 'Check a signature against a message.',
  hmac: 'Compute a keyed hash that proves a message was not changed.',
  'verify-hmac': 'Check an HMAC against a message.',
};

interface TransitWorkbenchProps {
  readonly mount: string;
  readonly transitKey: TransitKey;
  readonly operation?: TransitOperation;
  readonly onOperationChange: (operation: TransitOperation) => void;
}

/** One operation at a time; switching operation or key remounts the form, dropping its inputs and results. */
export default function TransitWorkbench({ mount, transitKey, operation, onOperationChange }: TransitWorkbenchProps) {
  const available = transitKeyOperations(transitKey);
  if (available.length === 0) {
    return (
      <p className="rounded-md border border-background-300 bg-background-100 px-3 py-2 text-xs leading-5 text-foreground-600">
        The console cannot run operations with a <span className="font-mono">{transitKey.type}</span> key.
      </p>
    );
  }
  const active = operation && available.includes(operation) ? operation : available[0];
  const Form = FORMS[active];
  const operations = TRANSIT_OPERATIONS.filter((entry) => available.includes(entry.key));
  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Operation" className="flex flex-wrap gap-1">
        {operations.map((entry) => {
          const selected = entry.key === active;
          return (
            <button
              key={entry.key}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onOperationChange(entry.key)}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 sm:min-h-8 ${
                selected
                  ? 'border-primary-300 bg-primary-50 text-primary-700'
                  : 'border-background-300 bg-background-50 text-foreground-600 hover:bg-background-100 hover:text-foreground-900'
              }`}
            >
              <i className={`${entry.icon} text-sm`} aria-hidden="true" />
              {entry.label}
            </button>
          );
        })}
      </div>
      <section aria-labelledby="transit-operation-title" className="rounded-lg border border-background-300 bg-background-50 p-3 sm:p-4">
        <h3 id="transit-operation-title" className="text-sm font-semibold text-foreground-900">
          {TRANSIT_OPERATIONS.find((entry) => entry.key === active)?.label}
        </h3>
        <p className="mb-3 mt-0.5 text-xs leading-5 text-foreground-600">{DESCRIPTIONS[active]}</p>
        <Form key={`${transitKey.name}:${active}`} mount={mount} transitKey={transitKey} />
      </section>
    </div>
  );
}
