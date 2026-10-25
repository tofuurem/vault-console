import { useRef, useState, type FormEvent } from 'react';

import type { UnsealFeedback } from '@/application/vault/unseal/useUnsealWorkflow';
import Button from '@/components/base/Button';

interface FeedbackContent {
  readonly tone: 'success' | 'warning' | 'danger';
  readonly text: string;
}

const FEEDBACK: Readonly<Record<Exclude<UnsealFeedback, 'unsealed'>, FeedbackContent>> = {
  accepted: { tone: 'success', text: 'Key share accepted. Enter the next share or wait for another operator.' },
  duplicate: { tone: 'warning', text: 'Vault already counted this key share in the current attempt. Enter a different share.' },
  'invalid-format': { tone: 'danger', text: 'This does not look like an unseal key share. Paste the hex or base64 value exactly as issued.' },
  'rejected-share': { tone: 'danger', text: 'Vault rejected this key share. Check that it belongs to this cluster and is not truncated.' },
  'reset-by-vault': { tone: 'danger', text: 'The submitted shares did not unseal Vault, so Vault discarded this attempt. Start again with valid shares.' },
  'reset-by-operator': { tone: 'warning', text: 'Unseal progress was reset. Previously submitted shares must be entered again.' },
};

const TONE_CLASSES: Readonly<Record<FeedbackContent['tone'], string>> = {
  success: 'border-success-200 bg-success-50 text-success-800',
  warning: 'border-warning-200 bg-warning-50 text-warning-900',
  danger: 'border-danger-200 bg-danger-50 text-danger-700',
};

const TONE_ICONS: Readonly<Record<FeedbackContent['tone'], string>> = {
  success: 'ri-checkbox-circle-line',
  warning: 'ri-information-line',
  danger: 'ri-error-warning-line',
};

interface UnsealKeyFormProps {
  readonly feedback?: UnsealFeedback;
  readonly submitting: boolean;
  readonly disabled: boolean;
  readonly onSubmit: (share: string) => Promise<unknown>;
}

export default function UnsealKeyForm({ feedback, submitting, disabled, onSubmit }: UnsealKeyFormProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [revealed, setRevealed] = useState(false);
  const message = feedback && feedback !== 'unsealed' ? FEEDBACK[feedback] : undefined;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input = inputRef.current;
    if (!input) return;
    const share = input.value;
    input.value = '';
    setRevealed(false);
    await onSubmit(share);
    input.focus();
  };

  return (
    <form
      name="vault-unseal"
      autoComplete="off"
      onSubmit={(event) => void handleSubmit(event)}
      className="space-y-3"
    >
      {message && (
        <div
          role={message.tone === 'danger' ? 'alert' : 'status'}
          className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs leading-5 ${TONE_CLASSES[message.tone]}`}
        >
          <i className={`${TONE_ICONS[message.tone]} mt-0.5 shrink-0 text-sm`} aria-hidden="true" />
          <span>{message.text}</span>
        </div>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor="unseal-key-share" className="text-xs font-medium text-foreground-700">
          Unseal key share
        </label>
        <div className="relative">
          <i className="ri-key-2-line pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-foreground-400" aria-hidden="true" />
          <input
            ref={inputRef}
            id="unseal-key-share"
            name="unseal-key-share"
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
            disabled={disabled}
            aria-describedby="unseal-key-share-hint"
            placeholder="Paste one key share"
            className="h-11 w-full rounded-md border border-background-300 bg-background-50 pl-8 pr-12 font-mono text-sm text-foreground-900 placeholder:font-sans placeholder:text-foreground-400 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400/30 disabled:cursor-not-allowed disabled:opacity-50 sm:h-9"
          />
          <button
            type="button"
            onClick={() => setRevealed((value) => !value)}
            disabled={disabled}
            aria-pressed={revealed}
            aria-label={revealed ? 'Hide key share' : 'Show key share'}
            className="absolute right-0.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md text-foreground-500 hover:bg-background-100 hover:text-foreground-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 disabled:opacity-50 sm:h-8 sm:w-8"
          >
            <i className={revealed ? 'ri-eye-off-line' : 'ri-eye-line'} aria-hidden="true" />
          </button>
        </div>
        <p id="unseal-key-share-hint" className="text-[11px] leading-5 text-foreground-500">
          One share per submission. The field is cleared immediately and the value is never stored.
        </p>
      </div>
      <Button type="submit" variant="primary" size="lg" className="w-full" loading={submitting} disabled={disabled}>
        {!submitting && <i className="ri-lock-unlock-line text-sm" aria-hidden="true" />}
        Submit key share
      </Button>
    </form>
  );
}
