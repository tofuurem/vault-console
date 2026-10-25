import { useEffect, useRef, useState } from 'react';

import { useToast } from '@/application/notifications/ToastContext';
import Button from '@/components/base/Button';
import type { PkiPrivateKey } from '@/domain/engines/pki/pki';
import { copyText, downloadText } from '../pki-format';

/** A public PEM value (certificate, chain, CSR) with copy and download. */
export function PemBlock({ label, pem, filename, collapsed = false }: {
  readonly label: string;
  readonly pem: string;
  readonly filename: string;
  readonly collapsed?: boolean;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(!collapsed);
  const copy = async () => {
    if (await copyText(pem)) toast.success(`${label} copied.`);
    else toast.error('The browser clipboard is unavailable.', { title: 'Copy failed' });
  };
  return (
    <section aria-label={label} className="overflow-hidden rounded-md border border-background-300">
      <header className="flex flex-wrap items-center justify-between gap-1 border-b border-background-200 bg-background-100 px-2.5 py-1">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          className="inline-flex min-h-11 items-center gap-1 rounded text-xs font-semibold text-foreground-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 sm:min-h-7"
        >
          <i className={`ri-arrow-right-s-line transition-transform motion-reduce:transition-none ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
          {label}
        </button>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => void copy()} aria-label={`Copy ${label.toLowerCase()}`}>
            <i className="ri-file-copy-line" aria-hidden="true" />
            Copy
          </Button>
          <Button size="sm" variant="ghost" onClick={() => downloadText(filename, pem)} aria-label={`Download ${label.toLowerCase()}`}>
            <i className="ri-download-2-line" aria-hidden="true" />
            Download
          </Button>
        </div>
      </header>
      {open && (
        <pre className="max-h-56 overflow-auto whitespace-pre bg-background-50 p-2.5 font-mono text-[11px] leading-4 text-foreground-800"><code>{pem.trim()}</code></pre>
      )}
    </section>
  );
}

/**
 * A private key Vault returned once. Masked until revealed (re-masks after a
 * few seconds), copied or downloaded on request, and never stored anywhere.
 */
export function PrivateKeyPanel({ privateKey, filename, onSaved }: {
  readonly privateKey: PkiPrivateKey;
  readonly filename: string;
  /** Called after a copy or download so dialogs can stop warning about closing. */
  readonly onSaved?: () => void;
}) {
  const toast = useToast();
  const [revealed, setRevealed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const toggle = () => {
    if (timer.current) clearTimeout(timer.current);
    setRevealed((current) => !current);
    if (!revealed) timer.current = setTimeout(() => setRevealed(false), 15_000);
  };
  const copy = async () => {
    if (await copyText(privateKey.reveal())) {
      toast.success('Private key copied.');
      onSaved?.();
    } else {
      toast.error('The browser clipboard is unavailable.', { title: 'Copy failed' });
    }
  };
  const download = () => {
    downloadText(filename, privateKey.reveal());
    onSaved?.();
  };

  return (
    <section aria-label="Private key" className="overflow-hidden rounded-md border border-warning-300">
      <div className="flex gap-2 border-b border-warning-200 bg-warning-50 px-3 py-2 text-xs leading-5 text-warning-900">
        <i className="ri-key-2-line mt-0.5 shrink-0 text-sm" aria-hidden="true" />
        <p>
          <strong className="font-semibold">Vault shows this private key only once.</strong> Copy or download it now;
          nobody can display it again, and this console does not keep it after you close this view.
        </p>
      </div>
      <header className="flex flex-wrap items-center justify-between gap-1 border-b border-background-200 bg-background-100 px-2.5 py-1">
        <span className="text-xs font-semibold text-foreground-800">
          Private key{privateKey.type && <span className="ml-1 font-normal text-foreground-500">({privateKey.type})</span>}
        </span>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={toggle} aria-pressed={revealed}>
            <i className={revealed ? 'ri-eye-off-line' : 'ri-eye-line'} aria-hidden="true" />
            {revealed ? 'Hide' : 'Reveal'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void copy()} aria-label="Copy private key">
            <i className="ri-file-copy-line" aria-hidden="true" />
            Copy
          </Button>
          <Button size="sm" variant="ghost" onClick={download} aria-label="Download private key">
            <i className="ri-download-2-line" aria-hidden="true" />
            Download
          </Button>
        </div>
      </header>
      {revealed ? (
        <pre className="max-h-56 overflow-auto whitespace-pre bg-background-50 p-2.5 font-mono text-[11px] leading-4 text-foreground-800"><code>{privateKey.reveal().trim()}</code></pre>
      ) : (
        <p className="select-none bg-background-50 p-2.5 font-mono text-[11px] text-foreground-400" aria-label="Private key hidden">
          {'•'.repeat(48)}
        </p>
      )}
    </section>
  );
}
