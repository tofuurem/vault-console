import { useEffect, useRef, useState } from 'react';

import type { UnwrappedSecret, UnwrappedSecretField } from '@/domain/vault/wrapping';
import { formatDateTime } from '@/shared/format/date-time';

const ICON_BUTTON = 'flex h-11 w-11 items-center justify-center rounded text-foreground-400 hover:bg-background-100 hover:text-foreground-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 sm:h-7 sm:w-7';

function FieldValue({ field, onCopied }: {
  readonly field: UnwrappedSecretField;
  readonly onCopied: (message: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const container = field.type === 'object' || field.type === 'array';

  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);

  const toggle = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (revealed) {
      setRevealed(false);
      return;
    }
    setRevealed(true);
    hideTimer.current = setTimeout(() => setRevealed(false), 8_000);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(field.value.reveal());
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 1_500);
      onCopied(`${field.key} copied`);
    } catch {
      setCopied(false);
      onCopied('Copy failed. The browser clipboard is unavailable.');
    }
  };

  return (
    <div className="flex min-w-0 items-center gap-1.5 sm:items-start">
      <div className="min-w-0 flex-1">
        {revealed && container ? (
          <pre className="max-h-48 overflow-auto whitespace-pre rounded bg-background-100 p-2 font-mono text-[11px] leading-5 text-foreground-800"><code>{field.value.reveal()}</code></pre>
        ) : (
          <span className={`block min-w-0 break-all font-mono text-xs ${revealed ? 'whitespace-pre-wrap text-foreground-800' : 'select-none text-foreground-400'}`}>
            {revealed ? field.value.reveal() : container ? field.type : '•'.repeat(12)}
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <button type="button" aria-label={`${revealed ? 'Hide' : 'Reveal'} ${field.key}`} aria-pressed={revealed} onClick={toggle} className={ICON_BUTTON}>
          <i className={`${revealed ? 'ri-eye-off-line' : 'ri-eye-line'} text-xs`} aria-hidden="true" />
        </button>
        <button type="button" aria-label={`Copy ${field.key}`} onClick={() => void copy()} className={ICON_BUTTON}>
          <i className={`${copied ? 'ri-check-line text-success-600' : 'ri-file-copy-line'} text-xs`} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export default function UnwrappedSecretView({ secret, creationPath }: {
  readonly secret: UnwrappedSecret;
  readonly creationPath: string;
}) {
  const [status, setStatus] = useState('');
  return (
    <div className="space-y-4">
      <div role="status" className="flex items-start gap-2 rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-xs leading-5 text-warning-900">
        <i className="ri-information-line mt-0.5 shrink-0 text-sm" aria-hidden="true" />
        <span>
          <strong className="font-semibold">This token is now used.</strong> Nobody can open it again. Copy what you need before leaving this page; the values are not saved.
        </span>
      </div>
      <dl className="space-y-1 text-xs">
        <div className="flex justify-between gap-3">
          <dt className="text-foreground-500">Shared from</dt>
          <dd className="break-all text-right font-mono text-foreground-800">{creationPath}</dd>
        </div>
        {secret.version !== undefined && (
          <div className="flex justify-between gap-3">
            <dt className="text-foreground-500">Version</dt>
            <dd className="font-mono text-foreground-800">v{secret.version}</dd>
          </div>
        )}
        {secret.createdTime && (
          <div className="flex justify-between gap-3">
            <dt className="text-foreground-500">Version created</dt>
            <dd className="text-right text-foreground-800">{formatDateTime(secret.createdTime)}</dd>
          </div>
        )}
      </dl>
      {secret.fields.length === 0 ? (
        <p className="rounded-md border border-background-200 bg-background-100 p-3 text-xs text-foreground-600">The shared response contained no secret fields.</p>
      ) : (
        <div className="overflow-hidden rounded-md border border-background-200">
          <div className="grid grid-cols-[minmax(90px,140px)_1fr] border-b border-background-200 bg-background-100 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-foreground-500"><span>Key</span><span>Value</span></div>
          <div className="divide-y divide-background-100">
            {secret.fields.map((field) => (
              <div key={field.key} className="grid grid-cols-[minmax(90px,140px)_1fr] items-center px-2.5 py-1 sm:items-start sm:py-2">
                <span className="break-all pr-2 font-mono text-xs font-medium text-foreground-700">{field.key}</span>
                <FieldValue field={field} onCopied={setStatus} />
              </div>
            ))}
          </div>
        </div>
      )}
      <span role="status" aria-live="polite" className="sr-only">{status}</span>
    </div>
  );
}
