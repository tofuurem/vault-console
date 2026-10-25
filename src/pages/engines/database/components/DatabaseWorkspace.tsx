import type { UseQueryResult } from '@tanstack/react-query';

import {
  useDatabaseConnections,
  useDatabaseRoles,
  useDatabaseStaticRoles,
} from '@/application/engines/database/useDatabaseEngine';
import Button from '@/components/base/Button';
import ContentSkeleton from '@/components/base/ContentSkeleton';
import { databaseErrorMessage } from '@/domain/engines/database/database-errors';
import EnginePageShell, { type EngineTab } from '../../components/EnginePageShell';
import type { EnginePageProps } from '../../engine-page';
import { databaseSubPath, parseDatabaseRoute, type DatabaseRoute, type DatabaseSection } from '../database-route';
import ConnectionDetail from './ConnectionDetail';
import ConnectionForm from './ConnectionForm';
import { ConnectionEditor, RoleEditor, StaticRoleEditor } from './DatabaseEditors';
import RoleDetail from './RoleDetail';
import RoleForm from './RoleForm';
import SectionView, { type NameListState } from './SectionView';
import StaticRoleDetail from './StaticRoleDetail';
import StaticRoleForm from './StaticRoleForm';

const SECTION_META: Record<DatabaseSection, { readonly label: string; readonly icon: string; readonly create: string }> = {
  config: { label: 'Connections', icon: 'ri-plug-line', create: 'New connection' },
  roles: { label: 'Roles', icon: 'ri-user-add-line', create: 'New role' },
  'static-roles': { label: 'Static roles', icon: 'ri-user-settings-line', create: 'New static role' },
};

function listState(query: UseQueryResult<readonly string[]>, action: string): NameListState {
  return {
    names: query.data,
    loading: query.isPending && query.fetchStatus !== 'idle',
    error: query.isError ? databaseErrorMessage(query.error, action) : undefined,
  };
}

interface SectionProps {
  readonly mount: string;
  readonly route: DatabaseRoute;
  readonly go: (route: DatabaseRoute) => void;
  readonly connections: NameListState;
  readonly list: NameListState;
}

function ConnectionsView({ mount, route, go, list }: SectionProps) {
  return (
    <SectionView
      section="config"
      title="Connections"
      icon="ri-plug-line"
      list={list}
      route={route}
      go={go}
      placeholder="Select a connection to see its settings."
      empty={{
        title: 'No connections yet',
        body: 'A connection tells Vault how to reach a database. Add a connection first, then create roles that issue credentials through it.',
        action: (
          <Button size="sm" variant="primary" onClick={() => go({ section: 'config', mode: 'create' })}>
            <i className="ri-add-line" aria-hidden="true" />
            Add connection
          </Button>
        ),
      }}
      renderDetail={(name) => <ConnectionDetail key={name} mount={mount} name={name} go={go} />}
      renderEdit={(name) => <ConnectionEditor mount={mount} name={name} go={go} />}
      renderCreate={() => (
        <ConnectionForm
          key="create"
          mount={mount}
          existingNames={list.names ?? []}
          onCancel={() => go({ section: 'config', mode: 'list' })}
          onSaved={(name) => go({ section: 'config', mode: 'view', name })}
        />
      )}
    />
  );
}

function RolesView({ mount, route, go, list, connections }: SectionProps) {
  const noConnections = connections.names?.length === 0;
  return (
    <SectionView
      section="roles"
      title="Roles"
      icon="ri-user-add-line"
      list={list}
      route={route}
      go={go}
      placeholder="Select a role to see its statements and generate credentials."
      empty={{
        title: 'No roles yet',
        body: noConnections
          ? 'Add a connection first, then create roles. Each role defines how Vault creates short-lived database users.'
          : 'A role defines the statements Vault runs to create a short-lived database user. Applications request credentials from a role.',
        action: (
          <Button
            size="sm"
            variant="primary"
            onClick={() => go(noConnections ? { section: 'config', mode: 'create' } : { section: 'roles', mode: 'create' })}
          >
            <i className="ri-add-line" aria-hidden="true" />
            {noConnections ? 'Add connection' : 'Create role'}
          </Button>
        ),
      }}
      renderDetail={(name) => <RoleDetail key={name} mount={mount} name={name} go={go} />}
      renderEdit={(name) => (connections.loading
        ? <ContentSkeleton variant="detail" label="Loading connections" />
        : <RoleEditor mount={mount} name={name} go={go} connectionNames={connections.names} />)}
      renderCreate={(connection) => (connections.loading ? <ContentSkeleton variant="detail" label="Loading connections" /> : (
        <RoleForm
          key={`create-${connection ?? ''}`}
          mount={mount}
          existingNames={list.names ?? []}
          connectionNames={connections.names}
          initialConnection={connection}
          onCancel={() => go({ section: 'roles', mode: 'list' })}
          onSaved={(name) => go({ section: 'roles', mode: 'view', name })}
          onAddConnection={() => go({ section: 'config', mode: 'create' })}
        />
      ))}
    />
  );
}

function StaticRolesView({ mount, route, go, list, connections }: SectionProps) {
  const noConnections = connections.names?.length === 0;
  return (
    <SectionView
      section="static-roles"
      title="Static roles"
      icon="ri-user-settings-line"
      list={list}
      route={route}
      go={go}
      placeholder="Select a static role to see its rotation and current credentials."
      empty={{
        title: 'No static roles yet',
        body: noConnections
          ? 'Add a connection first, then create static roles. A static role hands one existing database user to Vault.'
          : 'A static role hands the password of one existing database user to Vault, which rotates it on a schedule.',
        action: (
          <Button
            size="sm"
            variant="primary"
            onClick={() => go(noConnections ? { section: 'config', mode: 'create' } : { section: 'static-roles', mode: 'create' })}
          >
            <i className="ri-add-line" aria-hidden="true" />
            {noConnections ? 'Add connection' : 'Create static role'}
          </Button>
        ),
      }}
      renderDetail={(name) => <StaticRoleDetail key={name} mount={mount} name={name} go={go} />}
      renderEdit={(name) => (connections.loading
        ? <ContentSkeleton variant="detail" label="Loading connections" />
        : <StaticRoleEditor mount={mount} name={name} go={go} connectionNames={connections.names} />)}
      renderCreate={(connection) => (connections.loading ? <ContentSkeleton variant="detail" label="Loading connections" /> : (
        <StaticRoleForm
          key={`create-${connection ?? ''}`}
          mount={mount}
          existingNames={list.names ?? []}
          connectionNames={connections.names}
          initialConnection={connection}
          onCancel={() => go({ section: 'static-roles', mode: 'list' })}
          onSaved={(name) => go({ section: 'static-roles', mode: 'view', name })}
          onAddConnection={() => go({ section: 'config', mode: 'create' })}
        />
      ))}
    />
  );
}

/** Connections, dynamic roles, and static roles of one database secrets engine. */
export default function DatabaseWorkspace({ engine, subPath, navigateTo }: EnginePageProps) {
  const mount = engine.path;
  const route = parseDatabaseRoute(subPath);
  const go = (next: DatabaseRoute) => navigateTo(databaseSubPath(next));
  const connections = listState(useDatabaseConnections(mount), `listing connections on ${mount}/`);
  const roles = listState(useDatabaseRoles(mount), `listing roles on ${mount}/`);
  const staticRoles = listState(useDatabaseStaticRoles(mount), `listing static roles on ${mount}/`);
  const lists: Record<DatabaseSection, NameListState> = { config: connections, roles, 'static-roles': staticRoles };

  const tabs: readonly EngineTab[] = (Object.keys(SECTION_META) as DatabaseSection[]).map((key) => ({
    key,
    label: SECTION_META[key].label,
    icon: SECTION_META[key].icon,
    count: lists[key].names?.length,
  }));
  const meta = SECTION_META[route.section];
  const sectionProps: SectionProps = { mount, route, go, connections, list: lists[route.section] };

  return (
    <EnginePageShell
      engine={engine}
      tabs={tabs}
      activeTab={route.section}
      onTabChange={(key) => go({ section: key as DatabaseSection, mode: 'list' })}
      actions={route.mode !== 'create' && (
        <Button size="sm" variant="primary" aria-label={meta.create} onClick={() => go({ section: route.section, mode: 'create' })}>
          <i className="ri-add-line" aria-hidden="true" />
          <span className="sm:hidden">New</span>
          <span className="hidden sm:inline">{meta.create}</span>
        </Button>
      )}
    >
      {route.section === 'config' && <ConnectionsView {...sectionProps} />}
      {route.section === 'roles' && <RolesView {...sectionProps} />}
      {route.section === 'static-roles' && <StaticRolesView {...sectionProps} />}
    </EnginePageShell>
  );
}
