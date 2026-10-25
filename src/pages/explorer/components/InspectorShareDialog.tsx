import { useId, useState } from 'react';

import { useShareSecretOnce } from '@/application/vault/wrapping/useShareSecretOnce';
import Button from '@/components/base/Button';
import Modal from '@/components/base/Modal';
import type { VaultSession } from '@/domain/vault/contracts';
import { secretLogicalPath } from '@/domain/vault/secret-export';
import type { VaultWrappingToken } from '@/domain/vault/sensitive-value';
import {
  DEFAULT_WRAP_TTL,
  WRAP_TTL_OPTIONS,
  type WrapTtl,
} from '@/domain/vault/wrapping';
import { formatDateTime, formatRelativeTime } from '@/shared/format/date-time';
import { useInspectorClipboard } from './useInspectorClipboard';

interface InspectorShareDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly session: VaultSession;
  readonly mount: string;
  readonly path: string;
  readonly version: number;
}

function unwrapPageUrl(): string {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, '');
  return `${window.location.origin}${base}/unwrap`;
}

function TtlChoice({ value, onChange, disabled }: {
  readonly value: WrapTtl;
  readonly onChange: (value: WrapTtl) => void;
  readonly disabled: boolean;
}) {
  const name = useId();
  return (
    <fieldset disabled={disabled}>
      <legend className="mb-1.5 text-xs font-medium text-foreground-700">Token expires after</legend>
      <div className="grid grid-cols-3 gap-1.5">
        {WRAP_TTL_OPTIONS.map((option) => (
          <label
            key={option.value}
            className={`flex min-h-11 cursor-pointer items-center justify-center rounded-md border px-2 text-xs font-medium focus-within:ring-2 focus-within:ring-primary-400 sm:min-h-8 ${value === option.value ? 'border-primary-400 bg-primary-50 text-primary-700' : 'border-background-300 text-foreground-700 hover:bg-background-100'}`}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function SharedToken({ token, expiresAt, onDone }: {
  readonly token: VaultWrappingToken;
  readonly expiresAt?: number;
  readonly onDone: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const clipboard = useInspectorClipboard();
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-success-200 bg-success-50 p-3 text-xs text-success-800">
        <p className="font-semibold">One-time token created</p>
        <p className="mt-1 leading-5">
          Copy it now. It is shown only in this dialog and is not stored by the console.
        </p>
      </div>
      <div>
        <p className="mb-1 text-xs font-medium text-foreground-700">Wrapping token</p>
        <div className="flex items-center gap-1.5 rounded-md border border-background-300 bg-background-100 px-2.5 py-1.5">
          <code className={`min-w-0 flex-1 break-all font-mono text-xs ${revealed ? 'text-foreground-800' : 'select-none text-foreground-400'}`}>
            {revealed ? token.reveal() : '•'.repeat(24)}
          </code>
          <button
            type="button"
            aria-label={revealed ? 'Hide wrapping token' : 'Reveal wrapping token'}
            aria-pressed={revealed}
            onClick={() => setRevealed((current) => !current)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded text-foreground-500 hover:bg-background-200 hover:text-foreground-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 sm:h-7 sm:w-7"
          >
            <i className={revealed ? 'ri-eye-off-line' : 'ri-eye-line'} aria-hidden="true" />
          </button>
        </div>
        {expiresAt !== undefined && (
          <p className="mt-1 text-[11px] text-foreground-500">
            Expires {formatDateTime(new Date(expiresAt).toISOString())} ({formatRelativeTime(expiresAt)})
          </p>
        )}
      </div>
      <p className="text-[11px] leading-5 text-foreground-600">
        Anyone with this token can read the secret once until it expires. Send it over a trusted channel. The recipient opens{' '}
        <span className="break-all font-mono text-foreground-800">{unwrapPageUrl()}</span> and pastes the token; no console account is needed.
      </p>
      {!clipboard.announcesWithToast && <span role="status" aria-live="polite" className="sr-only">{clipboard.status}</span>}
      <div className="flex flex-wrap justify-end gap-2 border-t border-background-200 pt-3">
        <Button size="sm" variant="ghost" onClick={onDone}>Done</Button>
        <Button size="sm" variant="primary" onClick={() => void clipboard.copy(() => token.reveal(), 'Wrapping token copied')}>
          <i className={clipboard.succeeded ? 'ri-check-line' : 'ri-file-copy-line'} aria-hidden="true" />
          {clipboard.succeeded ? 'Copied' : 'Copy token'}
        </Button>
      </div>
    </div>
  );
}

export default function InspectorShareDialog({ open, onClose, session, mount, path, version }: InspectorShareDialogProps) {
  const [ttl, setTtl] = useState<WrapTtl>(DEFAULT_WRAP_TTL);
  const { state, share, reset } = useShareSecretOnce();
  const close = () => {
    reset();
    setTtl(DEFAULT_WRAP_TTL);
    onClose();
  };
  const wrapping = state.status === 'wrapping';

  return (
    <Modal open={open} onClose={close} title="Share once" width="sm">
      <div className="space-y-3 p-4 text-xs">
        <p className="break-all font-mono text-[11px] text-foreground-600">
          {secretLogicalPath(mount, path)} · v{version}
        </p>
        {state.status === 'shared' ? (
          <SharedToken token={state.share.token} expiresAt={state.expiresAt} onDone={close} />
        ) : (
          <>
            <p className="leading-5 text-foreground-600">
              Vault keeps a copy of this version and issues a token that can read it exactly once. The console never sees the data.
            </p>
            <TtlChoice value={ttl} onChange={setTtl} disabled={wrapping} />
            {state.status === 'error' && (
              <div role="alert" className="rounded-md border border-danger-200 bg-danger-50 p-3 text-danger-700">
                <p className="font-semibold">The token could not be created</p>
                <p className="mt-1 leading-5">{state.error.message}</p>
              </div>
            )}
            <div className="flex flex-wrap justify-end gap-2 border-t border-background-200 pt-3">
              <Button size="sm" variant="ghost" onClick={close} disabled={wrapping}>Cancel</Button>
              <Button
                size="sm"
                variant="primary"
                loading={wrapping}
                onClick={() => void share({ session, mount, path, version, ttl })}
              >
                {state.status === 'error' ? 'Try again' : 'Create one-time token'}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
