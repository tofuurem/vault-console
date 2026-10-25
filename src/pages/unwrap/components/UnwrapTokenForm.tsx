import { useRef, useState, type FormEvent } from 'react';

import type { UnwrapProblem } from '@/application/vault/wrapping/useUnwrapWorkflow';
import Button from '@/components/base/Button';

const PROBLEM_TEXT: Readonly<Record<Exclude<UnwrapProblem, 'vault'>, string>> = {
  'invalid-format': 'This does not look like a wrapping token. Paste it exactly as you received it.',
  'unknown-token': 'Vault does not recognize this token. It may have expired, already been used, or been copied incompletely.',
};

interface UnwrapTokenFormProps {
  readonly problem?: UnwrapProblem;
  readonly errorMessage?: string;
  readonly checking: boolean;
  readonly onSubmit: (token: string) => Promise<void>;
}

export default function UnwrapTokenForm({ problem, errorMessage, checking, onSubmit }: UnwrapTokenFormProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [revealed, setRevealed] = useState(false);
  const message = problem === 'vault' ? errorMessage : problem ? PROBLEM_TEXT[problem] : undefined;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input = inputRef.current;
    if (!input) return;
    const token = input.value;
    input.value = '';
    setRevealed(false);
    await onSubmit(token);
  };

  return (
    <form name="vault-unwrap" autoComplete="off" onSubmit={(event) => void handleSubmit(event)} className="space-y-3">
      {message && (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-xs leading-5 text-danger-700">
          <i className="ri-error-warning-line mt-0.5 shrink-0 text-sm" aria-hidden="true" />
          <span>{message}</span>
        </div>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor="unwrap-token" className="text-xs font-medium text-foreground-700">Wrapping token</label>
        <div className="relative">
          <i className="ri-key-2-line pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-foreground-400" aria-hidden="true" />
          <input
            ref={inputRef}
            id="unwrap-token"
            name="unwrap-token"
            type={revealed ? 'text' : 'password'}
            required
            autoFocus
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            data-1p-ignore="true"
            data-lpignore="true"
            data-bwignore="true"
            disabled={checking}
            aria-describedby="unwrap-token-hint"
            placeholder="Paste the token you received"
            className="h-11 w-full rounded-md border border-background-300 bg-background-50 pl-8 pr-12 font-mono text-sm text-foreground-900 placeholder:font-sans placeholder:text-foreground-400 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400/30 disabled:cursor-not-allowed disabled:opacity-50 sm:h-9"
          />
          <button
            type="button"
            onClick={() => setRevealed((value) => !value)}
            disabled={checking}
            aria-pressed={revealed}
            aria-label={revealed ? 'Hide token' : 'Show token'}
            className="absolute right-0.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md text-foreground-500 hover:bg-background-100 hover:text-foreground-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 disabled:opacity-50 sm:h-8 sm:w-8"
          >
            <i className={revealed ? 'ri-eye-off-line' : 'ri-eye-line'} aria-hidden="true" />
          </button>
        </div>
        <p id="unwrap-token-hint" className="text-[11px] leading-5 text-foreground-500">
          Checking the token does not use it up. The field is cleared right away and the token is never stored.
        </p>
      </div>
      <Button type="submit" variant="primary" size="lg" className="w-full" loading={checking}>
        {!checking && <i className="ri-search-line text-sm" aria-hidden="true" />}
        Check token
      </Button>
    </form>
  );
}
