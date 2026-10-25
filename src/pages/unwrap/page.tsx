import { useState } from 'react';
import { Link } from 'react-router-dom';

import { useRuntimeConfig } from '@/application/config/RuntimeConfigContext';
import { initialVaultServerUrl } from '@/application/config/runtime-config';
import { useWrappingGateway } from '@/application/vault/WrappingGatewayContext';
import {
  useUnwrapWorkflow,
  type CheckedWrappingToken,
} from '@/application/vault/wrapping/useUnwrapWorkflow';
import Button from '@/components/base/Button';
import CenteredPanelLayout from '@/components/base/CenteredPanelLayout';
import { Input } from '@/components/base/Input';
import { normalizeVaultServerUrl } from '@/domain/vault/server-url';
import { formatDateTime, formatRelativeTime } from '@/shared/format/date-time';
import UnwrapTokenForm from './components/UnwrapTokenForm';
import UnwrappedSecretView from './components/UnwrappedSecretView';
import EnvironmentBadge from '@/components/feature/EnvironmentBadge';

function safeServerUrl(value: string): string | undefined {
  try {
    return normalizeVaultServerUrl(value);
  } catch {
    return undefined;
  }
}

function ServerAddressField({ value, onApply }: {
  readonly value: string;
  readonly onApply: (value: string) => void;
}) {
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
          id="unwrap-vault-address"
          label="Address"
          type="url"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          error={error}
          placeholder="https://vault.example.com:8200"
          monospace
          spellCheck={false}
        />
        <Button type="submit" size="md">Use</Button>
      </form>
    </details>
  );
}

function CheckedToken({ checked, opening, errorMessage, onOpen, onCancel }: {
  readonly checked: CheckedWrappingToken;
  readonly opening: boolean;
  readonly errorMessage?: string;
  readonly onOpen: () => void;
  readonly onCancel: () => void;
}) {
  const { info, expiresAt } = checked;
  return (
    <div className="space-y-4">
      {errorMessage && (
        <div role="alert" className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-xs leading-5 text-danger-700">
          {errorMessage} The token may still be unused; try again.
        </div>
      )}
      <dl className="space-y-1.5 rounded-md border border-background-200 bg-background-100 p-3 text-xs">
        <div className="flex justify-between gap-3">
          <dt className="text-foreground-500">Shared from</dt>
          <dd className="break-all text-right font-mono text-foreground-800">{info.creationPath}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-foreground-500">Created</dt>
          <dd className="text-right text-foreground-800">{formatDateTime(info.creationTime)}</dd>
        </div>
        {expiresAt !== undefined && (
          <div className="flex justify-between gap-3">
            <dt className="text-foreground-500">Expires</dt>
            <dd className="text-right text-foreground-800">
              {formatDateTime(new Date(expiresAt).toISOString())} ({formatRelativeTime(expiresAt)})
            </dd>
          </div>
        )}
      </dl>
      <p className="text-xs leading-5 text-foreground-600">
        Opening the secret uses the token. Afterwards nobody, including you, can open it again.
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={opening}>Use a different token</Button>
        <Button variant="primary" onClick={onOpen} loading={opening}>
          {!opening && <i className="ri-lock-unlock-line text-sm" aria-hidden="true" />}
          Open secret
        </Button>
      </div>
    </div>
  );
}

export default function UnwrapPage() {
  const runtimeConfig = useRuntimeConfig();
  const gateway = useWrappingGateway();
  const [serverUrl, setServerUrl] = useState(() => (
    safeServerUrl(initialVaultServerUrl(runtimeConfig)) ?? window.location.origin
  ));
  const workflow = useUnwrapWorkflow({ serverUrl, gateway });
  const { state } = workflow;
  const entering = state.step === 'enter' || state.step === 'checking';

  return (
    <CenteredPanelLayout labelledBy="unwrap-heading" width="lg">
      <header className="border-b border-background-200 px-6 pb-5 pt-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-500 text-background-50">
            <i className="ri-mail-lock-line text-base" aria-hidden="true" />
          </div>
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.17em] text-primary-600">One-time secret</p>
            <div className="flex flex-wrap items-center gap-2"><h1 id="unwrap-heading" className="text-lg font-semibold tracking-tight text-foreground-900">Open a shared secret</h1><EnvironmentBadge /></div>
          </div>
        </div>
        <p className="text-xs leading-5 text-foreground-500">
          Someone shared a Vault secret with you through a single-use token. Paste it below to see where it came from, then open it once. No console account is needed.
        </p>
      </header>

      {runtimeConfig.allowCustomVaultAddress && entering && (
        <ServerAddressField value={serverUrl} onApply={setServerUrl} />
      )}

      <div className="space-y-5 p-6">
        {entering && (
          <UnwrapTokenForm
            problem={state.step === 'enter' ? state.problem : undefined}
            errorMessage={state.step === 'enter' ? state.error?.message : undefined}
            checking={state.step === 'checking'}
            onSubmit={workflow.check}
          />
        )}
        {(state.step === 'ready' || state.step === 'unwrapping') && (
          <CheckedToken
            checked={state.checked}
            opening={state.step === 'unwrapping'}
            errorMessage={state.step === 'ready' ? state.error?.message : undefined}
            onOpen={() => void workflow.unwrap()}
            onCancel={workflow.startOver}
          />
        )}
        {state.step === 'unwrapped' && (
          <>
            <UnwrappedSecretView secret={state.secret} creationPath={state.checked.info.creationPath} />
            <div className="flex justify-end">
              <Button variant="ghost" onClick={workflow.startOver}>
                <i className="ri-close-line" aria-hidden="true" />
                Clear and open another token
              </Button>
            </div>
          </>
        )}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-background-200 bg-background-100 px-6 py-3">
        <Link
          to="/login"
          className="inline-flex min-h-11 items-center gap-1.5 rounded px-1 text-[11px] font-medium text-foreground-600 hover:text-foreground-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 sm:min-h-7"
        >
          <i className="ri-login-box-line" aria-hidden="true" />
          Sign in to the console
        </Link>
        <span className="text-[10px] text-foreground-400">Tokens and values are never stored.</span>
      </footer>
    </CenteredPanelLayout>
  );
}
