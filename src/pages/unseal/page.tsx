import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { useRuntimeConfig } from '@/application/config/RuntimeConfigContext';
import {
  initialVaultServerUrl,
  requestedVaultServerUrl,
} from '@/application/config/runtime-config';
import { useSealGateway } from '@/application/vault/SealGatewayContext';
import { useVaultSession } from '@/application/vault/VaultSessionContext';
import { useUnsealWorkflow } from '@/application/vault/unseal/useUnsealWorkflow';
import Button from '@/components/base/Button';
import CenteredPanelLayout from '@/components/base/CenteredPanelLayout';
import { Input } from '@/components/base/Input';
import { unsealPhase, type VaultSealStatus } from '@/domain/vault/seal';
import { normalizeVaultServerUrl } from '@/domain/vault/server-url';
import UnsealKeyForm from './components/UnsealKeyForm';
import UnsealProgress from './components/UnsealProgress';
import UnsealStatusSummary from './components/UnsealStatusSummary';

const LINK_CLASSES = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 sm:min-h-9';

function safeServerUrl(value: string): string | undefined {
  try {
    return normalizeVaultServerUrl(value);
  } catch {
    return undefined;
  }
}

interface ServerAddressFieldProps {
  readonly value: string;
  readonly onApply: (value: string) => void;
}

function ServerAddressField({ value, onApply }: ServerAddressFieldProps) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState('');
  return (
    <details className="border-b border-background-200 px-6 py-3">
      <summary className="cursor-pointer text-[11px] font-medium text-foreground-500 hover:text-foreground-800">
        Vault server
      </summary>
      <form
        className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const normalized = safeServerUrl(draft);
          if (!normalized) {
            setError('Enter a complete HTTP or HTTPS Vault address.');
            return;
          }
          setError('');
          onApply(normalized);
        }}
      >
        <Input
          id="unseal-vault-address"
          label="Address"
          type="url"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          error={error}
          placeholder="https://vault.example.com:8200"
          monospace
          spellCheck={false}
        />
        <Button type="submit" size="md">Check</Button>
      </form>
    </details>
  );
}

function ResetAttempt({ status, busy, onReset }: {
  readonly status: VaultSealStatus;
  readonly busy: boolean;
  readonly onReset: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  if (status.progress === 0) return null;
  if (!confirming) {
    return (
      <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setConfirming(true)}>
        <i className="ri-restart-line" aria-hidden="true" />
        Reset attempt
      </Button>
    );
  }
  return (
    <div role="group" aria-label="Confirm unseal reset" className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] text-foreground-600">
        Discard {status.progress === 1 ? '1 submitted share' : `${status.progress} submitted shares`}?
      </span>
      <Button
        type="button"
        variant="danger"
        size="sm"
        disabled={busy}
        onClick={() => void onReset().finally(() => setConfirming(false))}
      >
        Reset
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>Cancel</Button>
    </div>
  );
}

function UnsealedPanel({ status, authenticated, serverUrl }: {
  readonly status: VaultSealStatus;
  readonly authenticated: boolean;
  readonly serverUrl: string;
}) {
  return (
    <div className="space-y-4 text-center" role="status">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-success-100 text-success-700">
        <i className="ri-shield-check-line text-xl" aria-hidden="true" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground-900">Vault is unsealed and serving requests</p>
        {status.clusterName && (
          <p className="mt-1 font-mono text-[11px] text-foreground-500">{status.clusterName}</p>
        )}
      </div>
      <Link
        to={authenticated ? '/explorer' : '/login'}
        state={authenticated ? undefined : { serverUrl }}
        className={`${LINK_CLASSES} w-full bg-primary-500 text-background-50 hover:bg-primary-600`}
      >
        <i className={authenticated ? 'ri-arrow-left-line' : 'ri-login-box-line'} aria-hidden="true" />
        {authenticated ? 'Return to console' : 'Continue to sign in'}
      </Link>
    </div>
  );
}

function PhaseNotice({ phase }: { readonly phase: 'uninitialized' | 'auto-unseal' }) {
  return (
    <div role="status" className="flex items-start gap-2 rounded-md border border-background-300 bg-background-100 px-3 py-2 text-xs leading-5 text-foreground-700">
      <i className="ri-information-line mt-0.5 shrink-0 text-sm text-primary-600" aria-hidden="true" />
      <span>
        {phase === 'uninitialized'
          ? 'Initialize Vault with vault operator init before it can be unsealed. Vault Console does not perform initialization because it returns root credentials.'
          : 'This Vault uses an auto-unseal mechanism. Recovery keys cannot unseal it; check the seal provider and Vault server logs. Status refreshes automatically.'}
      </span>
    </div>
  );
}

export default function UnsealPage() {
  const location = useLocation();
  const runtimeConfig = useRuntimeConfig();
  const gateway = useSealGateway();
  const vault = useVaultSession();
  const [serverUrl, setServerUrl] = useState(() => (
    safeServerUrl(initialVaultServerUrl(runtimeConfig, requestedVaultServerUrl(location.state)))
    ?? window.location.origin
  ));
  const workflow = useUnsealWorkflow({ serverUrl, gateway });
  const { status, operation } = workflow;
  const phase = status ? unsealPhase(status) : undefined;
  const busy = operation === 'submitting' || operation === 'resetting';
  const authenticated = vault.status === 'authenticated';

  return (
    <CenteredPanelLayout labelledBy="unseal-heading" width="lg">
      <header className="border-b border-background-200 px-6 pb-5 pt-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-500 text-background-50">
            <i className="ri-lock-unlock-fill text-base" aria-hidden="true" />
          </div>
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.17em] text-primary-600">Operator recovery</p>
            <h1 id="unseal-heading" className="text-lg font-semibold tracking-tight text-foreground-900">Unseal Vault</h1>
          </div>
        </div>
        <p className="text-xs leading-5 text-foreground-500">
          After a restart Vault stays sealed until enough key holders submit their shares. Each operator can enter a share from their own browser; progress updates automatically.
        </p>
      </header>

      {runtimeConfig.allowCustomVaultAddress && (
        <ServerAddressField value={serverUrl} onApply={setServerUrl} />
      )}

      <UnsealStatusSummary
        status={status}
        loading={operation === 'loading'}
        unavailable={!status && workflow.error !== undefined}
      />

      <div className="space-y-5 p-6">
        {workflow.error && (
          <div role="alert" className="flex items-start gap-2 rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-xs leading-5 text-danger-700">
            <i className="ri-error-warning-line mt-0.5 shrink-0 text-sm" aria-hidden="true" />
            <span className="min-w-0 flex-1">{workflow.error.message}</span>
            <button
              type="button"
              onClick={() => void workflow.refresh()}
              className="min-h-11 shrink-0 rounded px-1 font-medium underline underline-offset-2 hover:text-danger-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger-400 sm:min-h-0"
            >
              Retry
            </button>
          </div>
        )}

        {status && phase === 'unsealed' && (
          <UnsealedPanel status={status} authenticated={authenticated} serverUrl={serverUrl} />
        )}
        {(phase === 'uninitialized' || phase === 'auto-unseal') && <PhaseNotice phase={phase} />}
        {status && phase === 'awaiting-shares' && (
          <>
            <UnsealProgress status={status} />
            <UnsealKeyForm
              feedback={workflow.feedback}
              submitting={operation === 'submitting'}
              disabled={busy}
              onSubmit={workflow.submitKeyShare}
            />
          </>
        )}
        {!status && operation === 'loading' && (
          <div className="space-y-3" aria-hidden="true">
            <div className="h-3 w-1/2 animate-pulse rounded bg-background-200 motion-reduce:animate-none" />
            <div className="h-2 animate-pulse rounded-full bg-background-200 motion-reduce:animate-none" />
            <div className="h-11 animate-pulse rounded-md bg-background-200 motion-reduce:animate-none sm:h-9" />
          </div>
        )}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-background-200 bg-background-100 px-6 py-3">
        {phase !== 'unsealed' && (
          <Link
            to={authenticated ? '/explorer' : '/login'}
            state={authenticated ? undefined : { serverUrl }}
            className="inline-flex min-h-11 items-center gap-1.5 rounded px-1 text-[11px] font-medium text-foreground-600 hover:text-foreground-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 sm:min-h-7"
          >
            <i className="ri-arrow-left-line" aria-hidden="true" />
            {authenticated ? 'Back to console' : 'Back to sign in'}
          </Link>
        )}
        <div className="ml-auto flex items-center gap-1">
          {status && phase === 'awaiting-shares' && (
            <ResetAttempt status={status} busy={busy} onReset={workflow.resetProgress} />
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => void workflow.refresh()}
            aria-label="Refresh seal status"
          >
            <i className="ri-refresh-line" aria-hidden="true" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </footer>
    </CenteredPanelLayout>
  );
}
