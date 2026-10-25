import { useState } from 'react';

import {
  useDatabaseConnection,
  useDeleteConnection,
  useResetConnection,
  useRotateRootCredentials,
} from '@/application/engines/database/useDatabaseEngine';
import { useToast } from '@/application/notifications/ToastContext';
import Button from '@/components/base/Button';
import ContentSkeleton from '@/components/base/ContentSkeleton';
import { useConfirmDialog } from '@/components/base/useConfirmDialog';
import type { DatabaseConnection } from '@/domain/engines/database/database';
import { databaseErrorMessage, isNotFound } from '@/domain/engines/database/database-errors';
import { describeAllowedRoles } from '@/domain/engines/database/database-format';
import { databasePluginLabel, databaseUrlParameter } from '@/domain/engines/database/plugins';
import type { DatabaseRoute } from '../database-route';
import { DetailHeader, DetailList, Notice, StatementBlock, type DetailItem } from './DatabaseUi';
import TypedConfirmDialog from './TypedConfirmDialog';

interface ConnectionDetailProps {
  readonly mount: string;
  readonly name: string;
  readonly go: (route: DatabaseRoute) => void;
}

function connectionItems(connection: DatabaseConnection): readonly DetailItem[] {
  const urlLabel = { connection_url: 'Connection URL', url: 'URL', host: 'Host' }[databaseUrlParameter(connection.pluginName)];
  return [
    { label: 'Plugin', value: <>{databasePluginLabel(connection.pluginName)} <span className="font-mono text-foreground-500">({connection.pluginName}{connection.pluginVersion ? ` ${connection.pluginVersion}` : ''})</span></> },
    { label: urlLabel, value: connection.connectionUrl || '—', mono: true },
    { label: 'Username', value: connection.username || '—', mono: true },
    { label: 'Password', value: <span className="text-foreground-500">Stored in Vault, never shown</span> },
    { label: 'Allowed roles', value: describeAllowedRoles(connection.allowedRoles), mono: connection.allowedRoles.length > 0 && !connection.allowedRoles.includes('*') },
    { label: 'Verified on save', value: connection.verifyConnection ? 'Yes' : 'No' },
    { label: 'Password policy', value: connection.passwordPolicy || 'Plugin default', mono: Boolean(connection.passwordPolicy) },
    ...Object.entries(connection.otherSettings).map(([key, value]) => ({ label: key, value: String(value), mono: true })),
  ];
}

function RotateRootMessage({ connection }: { readonly connection: DatabaseConnection }) {
  const templated = databaseUrlParameter(connection.pluginName) !== 'connection_url'
    || connection.connectionUrl.includes('{{password}}');
  return (
    <>
      <p>
        Vault sets a new password for <span className="font-mono text-foreground-900">{connection.username || 'the connection user'}</span> and
        keeps it to itself. After this, the root password is known only to Vault: nobody can read it, including you, and
        anything else that signs in as this user stops working.
      </p>
      <p>Use a database user dedicated to Vault. This cannot be undone.</p>
      {!templated && (
        <Notice tone="warning">
          The connection URL does not use {'{{password}}'}. Rotation may fail or leave the connection unusable.
        </Notice>
      )}
    </>
  );
}

type Dialog = 'rotate' | 'delete' | undefined;

/** Settings of one connection with reset, root rotation, and delete. */
export default function ConnectionDetail({ mount, name, go }: ConnectionDetailProps) {
  const toast = useToast();
  const query = useDatabaseConnection(mount, name);
  const reset = useResetConnection(mount);
  const rotate = useRotateRootCredentials(mount);
  const remove = useDeleteConnection(mount);
  const [confirm, confirmDialog] = useConfirmDialog();
  const [dialog, setDialog] = useState<Dialog>();

  if (query.isPending) return <ContentSkeleton variant="detail" label="Loading connection" />;
  if (query.isError) {
    return (
      <Notice tone={isNotFound(query.error) ? 'info' : 'warning'} alert>
        {isNotFound(query.error)
          ? `There is no connection named ${name} on ${mount}/. It may have been deleted.`
          : databaseErrorMessage(query.error, `reading ${mount}/config/${name}`)}
      </Notice>
    );
  }
  const connection = query.data;

  const resetConnection = async () => {
    const confirmed = await confirm({
      title: `Reset ${name}`,
      message: 'Vault closes this connection and opens it again with the stored settings. Use this after the database restarts or its certificates change. Issued credentials stay valid.',
      confirmLabel: 'Reset connection',
    });
    if (!confirmed) return;
    reset.mutate(name, {
      onSuccess: () => toast.success(`Reset connection ${name}.`),
      onError: (error) => toast.error(databaseErrorMessage(error, `resetting ${mount}/reset/${name}`), { title: 'Reset failed' }),
    });
  };
  const closeDialog = () => {
    setDialog(undefined);
    rotate.reset();
    remove.reset();
  };

  return (
    <article aria-labelledby="database-connection-title" className="space-y-4">
      <DetailHeader
        titleId="database-connection-title"
        icon="ri-plug-line"
        title={name}
        subtitle={`${databasePluginLabel(connection.pluginName)} connection`}
        actions={(
          <>
            <Button size="sm" onClick={() => go({ section: 'config', mode: 'edit', name })}>
              <i className="ri-edit-line" aria-hidden="true" />
              Edit
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void resetConnection()} loading={reset.isPending}>
              <i className="ri-restart-line" aria-hidden="true" />
              Reset
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDialog('rotate')}>
              <i className="ri-key-2-line" aria-hidden="true" />
              Rotate root
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDialog('delete')}>
              <i className="ri-delete-bin-line" aria-hidden="true" />
              Delete
            </Button>
          </>
        )}
      />
      <DetailList items={connectionItems(connection)} />
      <StatementBlock label="Root rotation statements" statements={connection.rootRotationStatements} />
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-background-300 bg-background-100/60 px-3 py-2.5">
        <p className="text-xs leading-5 text-foreground-600">
          Next, create a role so applications can request credentials through this connection.
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" onClick={() => go({ section: 'roles', mode: 'create', connection: name })}>
            <i className="ri-user-add-line" aria-hidden="true" />
            New role
          </Button>
          <Button size="sm" variant="ghost" onClick={() => go({ section: 'static-roles', mode: 'create', connection: name })}>
            <i className="ri-user-settings-line" aria-hidden="true" />
            New static role
          </Button>
        </div>
      </div>

      {dialog === 'rotate' && (
        <TypedConfirmDialog
          open
          title="Rotate root credentials"
          confirmText={name}
          confirmLabel="Rotate root password"
          pending={rotate.isPending}
          error={rotate.isError ? databaseErrorMessage(rotate.error, `rotating ${mount}/rotate-root/${name}`) : undefined}
          onCancel={closeDialog}
          onConfirm={() => rotate.mutate(name, {
            onSuccess: () => {
              closeDialog();
              toast.success(`Rotated the root password of ${name}. Only Vault knows it now.`);
            },
          })}
        >
          <RotateRootMessage connection={connection} />
        </TypedConfirmDialog>
      )}
      {dialog === 'delete' && (
        <TypedConfirmDialog
          open
          title="Delete connection"
          confirmText={name}
          confirmLabel="Delete connection"
          pending={remove.isPending}
          error={remove.isError ? databaseErrorMessage(remove.error, `deleting ${mount}/config/${name}`) : undefined}
          onCancel={closeDialog}
          onConfirm={() => remove.mutate(name, {
            onSuccess: () => {
              setDialog(undefined);
              toast.success(`Deleted connection ${name}.`);
              go({ section: 'config', mode: 'list' });
            },
          })}
        >
          <p>
            Vault forgets how to reach this database. Roles and static roles that use <span className="font-mono text-foreground-900">{name}</span> stop
            issuing credentials, and Vault can no longer revoke the users it created through it.
          </p>
          <p>The database itself is not changed. This cannot be undone.</p>
        </TypedConfirmDialog>
      )}
      {confirmDialog}
    </article>
  );
}
