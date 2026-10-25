import { useDatabaseConnection, useDatabaseRole, useDeleteRole } from '@/application/engines/database/useDatabaseEngine';
import { useToast } from '@/application/notifications/ToastContext';
import Button from '@/components/base/Button';
import ContentSkeleton from '@/components/base/ContentSkeleton';
import { useConfirmDialog } from '@/components/base/useConfirmDialog';
import { databaseErrorMessage, isNotFound } from '@/domain/engines/database/database-errors';
import { connectionAllowsRole, ttlText } from '@/domain/engines/database/database-format';
import type { DatabaseRoute } from '../database-route';
import CredentialsPanel from './CredentialsPanel';
import { ConnectionLink, DetailHeader, DetailList, Notice, StatementBlock } from './DatabaseUi';

interface RoleDetailProps {
  readonly mount: string;
  readonly name: string;
  readonly go: (route: DatabaseRoute) => void;
}

/** A dynamic role: its settings, statements, and on-demand credentials. */
export default function RoleDetail({ mount, name, go }: RoleDetailProps) {
  const toast = useToast();
  const query = useDatabaseRole(mount, name);
  const connection = useDatabaseConnection(mount, query.data?.dbName);
  const remove = useDeleteRole(mount);
  const [confirm, confirmDialog] = useConfirmDialog();

  if (query.isPending) return <ContentSkeleton variant="detail" label="Loading role" />;
  if (query.isError) {
    return (
      <Notice tone={isNotFound(query.error) ? 'info' : 'warning'} alert>
        {isNotFound(query.error)
          ? `There is no role named ${name} on ${mount}/. It may have been deleted.`
          : databaseErrorMessage(query.error, `reading ${mount}/roles/${name}`)}
      </Notice>
    );
  }
  const role = query.data;
  const notAllowed = connection.data && !connectionAllowsRole(connection.data.allowedRoles, name);

  const deleteRole = async () => {
    const confirmed = await confirm({
      title: `Delete role ${name}`,
      message: 'Applications can no longer request credentials from this role. Users Vault already created stay valid until their leases end or are revoked.',
      confirmLabel: 'Delete role',
    });
    if (!confirmed) return;
    remove.mutate(name, {
      onSuccess: () => {
        toast.success(`Deleted role ${name}.`);
        go({ section: 'roles', mode: 'list' });
      },
      onError: (error) => toast.error(databaseErrorMessage(error, `deleting ${mount}/roles/${name}`), { title: 'Role was not deleted' }),
    });
  };

  return (
    <article aria-labelledby="database-role-title" className="space-y-4">
      <DetailHeader
        titleId="database-role-title"
        icon="ri-user-add-line"
        title={name}
        subtitle="Dynamic role"
        actions={(
          <>
            <Button size="sm" onClick={() => go({ section: 'roles', mode: 'edit', name })}>
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
          { label: 'Connection', value: <ConnectionLink name={role.dbName} onOpen={() => go({ section: 'config', mode: 'view', name: role.dbName })} /> },
          { label: 'Default TTL', value: <span className="tabular-nums">{ttlText(role.defaultTtlSeconds)}</span> },
          { label: 'Max TTL', value: <span className="tabular-nums">{ttlText(role.maxTtlSeconds)}</span> },
          { label: 'Credential type', value: role.credentialType, mono: true },
        ]}
      />
      {notAllowed && (
        <Notice tone="warning">
          The connection {role.dbName} does not list {name} in its allowed roles, so Vault will refuse to issue
          credentials. Edit the connection to allow this role.
        </Notice>
      )}
      <CredentialsPanel key={name} mount={mount} role={name} />
      <StatementBlock label="Creation statements" statements={role.creationStatements} fallback="None" />
      <StatementBlock label="Revocation statements" statements={role.revocationStatements} />
      <StatementBlock label="Rollback statements" statements={role.rollbackStatements} />
      <StatementBlock label="Renew statements" statements={role.renewStatements} />
      {confirmDialog}
    </article>
  );
}
