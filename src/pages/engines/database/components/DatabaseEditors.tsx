import {
  useDatabaseConnection,
  useDatabaseRole,
  useDatabaseStaticRole,
} from '@/application/engines/database/useDatabaseEngine';
import ContentSkeleton from '@/components/base/ContentSkeleton';
import { databaseErrorMessage, isNotFound } from '@/domain/engines/database/database-errors';
import type { DatabaseRoute } from '../database-route';
import ConnectionForm from './ConnectionForm';
import { Notice } from './DatabaseUi';
import RoleForm from './RoleForm';
import StaticRoleForm from './StaticRoleForm';

interface EditorProps {
  readonly mount: string;
  readonly name: string;
  readonly go: (route: DatabaseRoute) => void;
}

function LoadError({ error, what, path }: { readonly error: unknown; readonly what: string; readonly path: string }) {
  return (
    <Notice tone={isNotFound(error) ? 'info' : 'warning'} alert>
      {isNotFound(error)
        ? `There is no ${what} at ${path}. It may have been deleted.`
        : databaseErrorMessage(error, `reading ${path}`)}
    </Notice>
  );
}

export function ConnectionEditor({ mount, name, go }: EditorProps) {
  const query = useDatabaseConnection(mount, name);
  if (query.isPending) return <ContentSkeleton variant="detail" label="Loading connection" />;
  if (query.isError) return <LoadError error={query.error} what="connection" path={`${mount}/config/${name}`} />;
  const view = () => go({ section: 'config', mode: 'view', name });
  return <ConnectionForm key={name} mount={mount} connection={query.data} existingNames={[]} onCancel={view} onSaved={view} />;
}

export function RoleEditor({ mount, name, go, connectionNames }: EditorProps & { readonly connectionNames: readonly string[] | undefined }) {
  const query = useDatabaseRole(mount, name);
  if (query.isPending) return <ContentSkeleton variant="detail" label="Loading role" />;
  if (query.isError) return <LoadError error={query.error} what="role" path={`${mount}/roles/${name}`} />;
  const view = () => go({ section: 'roles', mode: 'view', name });
  return (
    <RoleForm
      key={name}
      mount={mount}
      role={query.data}
      existingNames={[]}
      connectionNames={connectionNames}
      onCancel={view}
      onSaved={view}
      onAddConnection={() => go({ section: 'config', mode: 'create' })}
    />
  );
}

export function StaticRoleEditor({ mount, name, go, connectionNames }: EditorProps & { readonly connectionNames: readonly string[] | undefined }) {
  const query = useDatabaseStaticRole(mount, name);
  if (query.isPending) return <ContentSkeleton variant="detail" label="Loading static role" />;
  if (query.isError) return <LoadError error={query.error} what="static role" path={`${mount}/static-roles/${name}`} />;
  const view = () => go({ section: 'static-roles', mode: 'view', name });
  return (
    <StaticRoleForm
      key={name}
      mount={mount}
      role={query.data}
      existingNames={[]}
      connectionNames={connectionNames}
      onCancel={view}
      onSaved={view}
      onAddConnection={() => go({ section: 'config', mode: 'create' })}
    />
  );
}
