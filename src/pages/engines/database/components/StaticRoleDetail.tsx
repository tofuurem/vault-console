import {
  useDatabaseConnection,
  useDatabaseStaticRole,
  useDeleteStaticRole,
} from '@/application/engines/database/useDatabaseEngine';
import { useToast } from '@/application/notifications/ToastContext';
import Button from '@/components/base/Button';
import ContentSkeleton from '@/components/base/ContentSkeleton';
import { useConfirmDialog } from '@/components/base/useConfirmDialog';
import { databaseErrorMessage, isNotFound } from '@/domain/engines/database/database-errors';
import { connectionAllowsRole, describeRotation } from '@/domain/engines/database/database-format';
import { formatDateTime } from '@/shared/format/date-time';
import type { DatabaseRoute } from '../database-route';
import { ConnectionLink, DetailHeader, DetailList, Notice, StatementBlock } from './DatabaseUi';
import StaticCredentialsPanel from './StaticCredentialsPanel';

interface StaticRoleDetailProps {
  readonly mount: string;
  readonly name: string;
  readonly go: (route: DatabaseRoute) => void;
}

/** A static role: one database user whose password Vault rotates. */
export default function StaticRoleDetail({ mount, name, go }: StaticRoleDetailProps) {
  const toast = useToast();
  const query = useDatabaseStaticRole(mount, name);
  const connection = useDatabaseConnection(mount, query.data?.dbName);
  const remove = useDeleteStaticRole(mount);
  const [confirm, confirmDialog] = useConfirmDialog();

  if (query.isPending) return <ContentSkeleton variant="detail" label="Loading static role" />;
  if (query.isError) {
    return (
      <Notice tone={isNotFound(query.error) ? 'info' : 'warning'} alert>
        {isNotFound(query.error)
          ? `There is no static role named ${name} on ${mount}/. It may have been deleted.`
          : databaseErrorMessage(query.error, `reading ${mount}/static-roles/${name}`)}
      </Notice>
    );
  }
  const role = query.data;
  const notAllowed = connection.data && !connectionAllowsRole(connection.data.allowedRoles, name);

  const deleteRole = async () => {
    const confirmed = await confirm({
      title: `Delete static role ${name}`,
      message: `Vault stops managing ${role.username}. The database user keeps its current password, which only Vault knows. Read it first if you still need it.`,
      confirmLabel: 'Delete static role',
    });
    if (!confirmed) return;
    remove.mutate(name, {
      onSuccess: () => {
        toast.success(`Deleted static role ${name}.`);
        go({ section: 'static-roles', mode: 'list' });
      },
      onError: (error) => toast.error(databaseErrorMessage(error, `deleting ${mount}/static-roles/${name}`), { title: 'Static role was not deleted' }),
    });
  };

  return (
    <article aria-labelledby="database-static-role-title" className="space-y-4">
      <DetailHeader
        titleId="database-static-role-title"
        icon="ri-user-settings-line"
        title={name}
        subtitle="Static role"
        actions={(
          <>
            <Button size="sm" onClick={() => go({ section: 'static-roles', mode: 'edit', name })}>
              <i className="ri-edit-line" aria-hidden="true" />
              Edit
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void deleteRole()} loading={remove.isPending}>
              <i className="ri-delete-bin-line" aria-hidden="true" />
              Delete
            </Button>
          </>
        )}
      />
      <DetailList
        items={[
          {
            label: 'Connection',
            value: <ConnectionLink name={role.dbName} onOpen={() => go({ section: 'config', mode: 'view', name: role.dbName })} />,
          },
          { label: 'Database user', value: role.username, mono: true },
          { label: 'Rotation', value: <span className="tabular-nums">{describeRotation(role.rotation)}</span> },
          { label: 'Last rotated', value: <span className="tabular-nums">{role.lastVaultRotation ? formatDateTime(role.lastVaultRotation) : 'Never'}</span> },
          { label: 'Credential type', value: role.credentialType, mono: true },
        ]}
      />
      {notAllowed && (
        <Notice tone="warning">
          The connection {role.dbName} does not list {name} in its allowed roles, so Vault cannot read or rotate this
          password. Edit the connection to allow this role.
        </Notice>
      )}
      <StaticCredentialsPanel key={name} mount={mount} role={name} username={role.username} />
      <StatementBlock label="Rotation statements" statements={role.rotationStatements} />
      {confirmDialog}
    </article>
  );
}
