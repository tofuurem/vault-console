import { type FormEvent, useState } from 'react';

import Button from '@/components/base/Button';
import { Input } from '@/components/base/Input';
import {
  kvSecretPathError,
  normalizeKvSecretPath,
} from '@/domain/vault/kv-secret-path';

interface OpenExactPathFormProps {
  readonly mount: string;
  readonly onOpen: (path: string) => void;
  readonly onCancel?: () => void;
  readonly autoFocus?: boolean;
}

export default function OpenExactPathForm({
  mount,
  onOpen,
  onCancel,
  autoFocus = false,
}: OpenExactPathFormProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string>();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationError = kvSecretPathError(value);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(undefined);
    onOpen(normalizeKvSecretPath(value));
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1">
        <Input
          label={`Secret path relative to ${mount}`}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) setError(undefined);
          }}
          error={error}
          placeholder="team/service"
          monospace
          autoComplete="off"
          autoFocus={autoFocus}
        />
      </div>
      <div className="flex shrink-0 gap-2">
        {onCancel && <Button type="button" size="sm" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" size="sm" variant="primary">Open exact path</Button>
      </div>
    </form>
  );
}
