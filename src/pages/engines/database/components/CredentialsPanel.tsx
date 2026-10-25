import { useState } from 'react';

import {
  useGenerateCredentials,
  useRenewLease,
  useRevokeLease,
} from '@/application/engines/database/useDatabaseEngine';
import { useToast } from '@/application/notifications/ToastContext';
import Button from '@/components/base/Button';
import { Input } from '@/components/base/Input';
import { useConfirmDialog } from '@/components/base/useConfirmDialog';
import { databaseErrorMessage } from '@/domain/engines/database/database-errors';
import { durationError, formatTtlSeconds, type VaultApiResponse } from '@/domain/engines/engines';
import ApiResponsePanel from '../../components/ApiResponsePanel';
import { Notice } from './DatabaseUi';

interface CredentialsPanelProps {
  readonly mount: string;
  readonly role: string;
}

function LeaseActions({ response, onRenewed, onRevoked }: {
  readonly response: VaultApiResponse;
  readonly onRenewed: (durationSeconds: number, renewable: boolean) => void;
  readonly onRevoked: () => void;
}) {
  const toast = useToast();
  const renew = useRenewLease();
  const revoke = useRevokeLease();
  const [confirm, confirmDialog] = useConfirmDialog();
  const [increment, setIncrement] = useState('');
  const incrementError = durationError(increment);
  const leaseId = response.leaseId ?? '';

  const renewLease = () => {
    if (incrementError) return;
    renew.mutate({ leaseId, increment: increment.trim() || undefined }, {
      onSuccess: (result) => {
        onRenewed(result.leaseDurationSeconds, result.renewable);
        toast.success(`Lease renewed. It now ends in ${formatTtlSeconds(result.leaseDurationSeconds)}.`);
      },
      onError: (error) => toast.error(databaseErrorMessage(error, 'renewing leases'), { title: 'Lease was not renewed' }),
    });
  };
  const revokeLease = async () => {
    const confirmed = await confirm({
      title: 'Revoke lease',
      message: 'Vault drops the database user created for this lease now. Anything signed in with these credentials loses access.',
      confirmLabel: 'Revoke lease',
    });
    if (!confirmed) return;
    revoke.mutate(leaseId, {
      onSuccess: () => {
        onRevoked();
        toast.success('Revoked the lease. Vault dropped the database user.');
      },
      onError: (error) => toast.error(databaseErrorMessage(error, 'revoking leases'), { title: 'Lease was not revoked' }),
    });
  };

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-background-300 bg-background-50 p-3">
      {response.renewable && (
        <>
          <div className="w-full min-[420px]:w-28">
            <Input
              label="Extend by"
              value={increment}
              onChange={(event) => setIncrement(event.target.value)}
              placeholder="Default"
              error={incrementError}
              spellCheck={false}
              monospace
            />
          </div>
          <Button size="sm" onClick={renewLease} loading={renew.isPending} disabled={Boolean(incrementError)}>
            <i className="ri-refresh-line" aria-hidden="true" />
            Renew lease
          </Button>
        </>
      )}
      <Button size="sm" variant="ghost" onClick={() => void revokeLease()} loading={revoke.isPending}>
        <i className="ri-close-circle-line" aria-hidden="true" />
        Revoke lease
      </Button>
      {confirmDialog}
    </div>
  );
}

/**
 * Generates dynamic credentials on request. The response lives in this
 * component's state only and disappears on Clear, revoke, or navigation.
 */
export default function CredentialsPanel({ mount, role }: CredentialsPanelProps) {
  const generate = useGenerateCredentials(mount);
  const [response, setResponse] = useState<VaultApiResponse>();

  const run = () => generate.mutate(role, {
    onSuccess: (value) => {
      setResponse(value);
      // Drop the secret from the mutation state; only this component keeps it.
      generate.reset();
    },
  });

  return (
    <section aria-labelledby="database-credentials-title" className="space-y-3 rounded-lg border border-primary-200 bg-primary-50/40 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-xl">
          <h3 id="database-credentials-title" className="text-xs font-semibold text-foreground-900">Credentials</h3>
          <p className="mt-0.5 text-xs leading-5 text-foreground-600">
            Each request creates a new database user with its own lease. Vault drops the user when the lease ends or
            is revoked.
          </p>
        </div>
        <Button size="sm" variant="primary" onClick={run} loading={generate.isPending}>
          <i className="ri-key-2-line" aria-hidden="true" />
          {response ? 'Generate another' : 'Generate credentials'}
        </Button>
      </div>
      {generate.isError && (
        <Notice tone="danger" title="Credentials were not generated">
          {databaseErrorMessage(generate.error, `reading ${mount}/creds/${role}`)}
        </Notice>
      )}
      {response && (
        <>
          <ApiResponsePanel title={`Credentials for ${role}`} response={response} onDismiss={() => setResponse(undefined)} />
          <LeaseActions
            key={response.leaseId}
            response={response}
            onRenewed={(leaseDurationSeconds, renewable) => setResponse((current) => (
              current ? { ...current, leaseDurationSeconds, renewable } : current
            ))}
            onRevoked={() => setResponse(undefined)}
          />
          <p className="text-[11px] leading-4 text-foreground-500">
            Clearing only hides these values. The user stays valid until its lease ends; revoke it if you no longer need it.
          </p>
        </>
      )}
    </section>
  );
}
