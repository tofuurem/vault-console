import { useState } from 'react';

import { useRotateStaticRole, useStaticCredentials } from '@/application/engines/database/useDatabaseEngine';
import { useToast } from '@/application/notifications/ToastContext';
import Button from '@/components/base/Button';
import { useConfirmDialog } from '@/components/base/useConfirmDialog';
import type { StaticCredentials } from '@/domain/engines/database/database';
import { databaseErrorMessage } from '@/domain/engines/database/database-errors';
import { formatTtlSeconds } from '@/domain/engines/engines';
import { formatDateTime } from '@/shared/format/date-time';
import ApiResponsePanel from '../../components/ApiResponsePanel';
import { Notice } from './DatabaseUi';

interface StaticCredentialsPanelProps {
  readonly mount: string;
  readonly role: string;
  readonly username: string;
}

/**
 * Reads the current password of a static role on request and rotates it on
 * demand. Reading does not create a user; the values stay in this component.
 */
export default function StaticCredentialsPanel({ mount, role, username }: StaticCredentialsPanelProps) {
  const toast = useToast();
  const read = useStaticCredentials(mount);
  const rotate = useRotateStaticRole(mount);
  const [confirm, confirmDialog] = useConfirmDialog();
  const [credentials, setCredentials] = useState<StaticCredentials>();

  const show = () => read.mutate(role, {
    onSuccess: (value) => {
      setCredentials(value);
      read.reset();
    },
  });
  const rotateNow = async () => {
    const confirmed = await confirm({
      title: 'Rotate password now',
      message: `Vault sets a new password for ${username} right away. Applications using the current password lose access until they read the new one from Vault.`,
      confirmLabel: 'Rotate now',
    });
    if (!confirmed) return;
    rotate.mutate(role, {
      onSuccess: () => {
        setCredentials(undefined);
        toast.success(`Rotated the password of ${username}.`);
      },
      onError: (error) => toast.error(databaseErrorMessage(error, `rotating ${mount}/rotate-role/${role}`), { title: 'Password was not rotated' }),
    });
  };

  return (
    <section aria-labelledby="database-static-credentials-title" className="space-y-3 rounded-lg border border-primary-200 bg-primary-50/40 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-xl">
          <h3 id="database-static-credentials-title" className="text-xs font-semibold text-foreground-900">Current credentials</h3>
          <p className="mt-0.5 text-xs leading-5 text-foreground-600">
            Vault manages the password of one existing user. Reading it does not create a user or change the password.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="primary" onClick={show} loading={read.isPending}>
            <i className="ri-eye-line" aria-hidden="true" />
            {credentials ? 'Read again' : 'Get credentials'}
          </Button>
          <Button size="sm" onClick={() => void rotateNow()} loading={rotate.isPending}>
            <i className="ri-refresh-line" aria-hidden="true" />
            Rotate now
          </Button>
        </div>
      </div>
      {read.isError && (
        <Notice tone="danger" title="Credentials could not be read">
          {databaseErrorMessage(read.error, `reading ${mount}/static-creds/${role}`)}
        </Notice>
      )}
      {credentials && (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
            <dt className="text-foreground-500">Last rotated</dt>
            <dd className="tabular-nums text-foreground-800">{credentials.lastVaultRotation ? formatDateTime(credentials.lastVaultRotation) : 'Never'}</dd>
            <dt className="text-foreground-500">Next rotation</dt>
            <dd className="tabular-nums text-foreground-800">
              {credentials.ttlSeconds > 0 ? `in ${formatTtlSeconds(credentials.ttlSeconds)}` : 'Not scheduled'}
            </dd>
          </dl>
          <ApiResponsePanel
            title={`Credentials for ${role}`}
            response={{ data: { username: credentials.username, password: credentials.password }, warnings: [] }}
            onDismiss={() => setCredentials(undefined)}
          />
        </>
      )}
      {confirmDialog}
    </section>
  );
}
