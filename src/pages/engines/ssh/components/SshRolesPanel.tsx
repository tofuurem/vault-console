import { useSshRole, useSshRoles } from '@/application/engines/ssh/useSsh';
import Badge from '@/components/base/Badge';
import Button from '@/components/base/Button';
import ContentSkeleton from '@/components/base/ContentSkeleton';
import type { SshRoleSummary } from '@/domain/engines/ssh/ssh';
import { emptyCaRoleInput, formatRoleTtl, roleToInput } from '@/domain/engines/ssh/ssh-roles';
import SshRoleEditor from './SshRoleEditor';
import { EmptyState, ErrorNotice, Notice, Panel } from './ssh-ui';

interface SshRolesPanelProps {
  readonly mount: string;
  readonly selected?: string;
  readonly creating: boolean;
  /** `false` when the mount has no CA, `undefined` while unknown. */
  readonly caConfigured?: boolean;
  readonly onSelect: (name: string | undefined) => void;
  readonly onCreate: () => void;
  readonly onCancelCreate: () => void;
  readonly onOpenCa: () => void;
  readonly onSign: (role: string) => void;
  readonly onOtp: (role: string) => void;
}

function roleTypeLabel(keyType: string): { readonly label: string; readonly variant: 'info' | 'default' | 'warning' } {
  if (keyType === 'ca') return { label: 'Certificates', variant: 'info' };
  if (keyType === 'otp') return { label: 'OTP', variant: 'default' };
  if (keyType === 'dynamic') return { label: 'Dynamic (removed)', variant: 'warning' };
  return { label: keyType, variant: 'warning' };
}

function RoleList({ roles, selected, onSelect }: {
  readonly roles: readonly SshRoleSummary[];
  readonly selected?: string;
  readonly onSelect: (name: string) => void;
}) {
  return (
    <ul aria-label="Roles" className="divide-y divide-background-200 overflow-hidden rounded-lg border border-background-300 bg-background-50">
      {roles.map((role) => {
        const type = roleTypeLabel(role.keyType);
        const active = role.name === selected;
        return (
          <li key={role.name}>
            <button
              type="button"
              aria-current={active ? 'true' : undefined}
              onClick={() => onSelect(role.name)}
              className={`flex min-h-11 w-full items-center gap-2 px-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400 sm:min-h-9 ${
                active ? 'bg-primary-50' : 'hover:bg-background-100'
              }`}
            >
              <i className={`${role.keyType === 'otp' ? 'ri-key-line' : 'ri-file-shield-2-line'} text-sm text-foreground-500`} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground-800">{role.name}</span>
              <Badge variant={type.variant}>{type.label}</Badge>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function RoleDetail({ mount, name, existingNames, onSelect, onSign, onOtp }: {
  readonly mount: string;
  readonly name: string;
  readonly existingNames: readonly string[];
  readonly onSelect: (name: string | undefined) => void;
  readonly onSign: (role: string) => void;
  readonly onOtp: (role: string) => void;
}) {
  const role = useSshRole(mount, name);
  if (role.isPending) return <ContentSkeleton variant="detail" label={`Loading role ${name}`} />;
  if (role.isError) {
    return (
      <ErrorNotice
        title={`Role ${name} could not be read`}
        error={role.error}
        permissionHint={`Your token needs read on ${mount}/roles/${name}.`}
        requestHint="Roles with the removed dynamic key type cannot be opened here."
      />
    );
  }
  const data = role.data;
  const summary = data.keyType === 'ca'
    ? `${[data.allowUserCertificates && 'user', data.allowHostCertificates && 'host'].filter(Boolean).join(' and ')} certificates · TTL ${formatRoleTtl(data.ttlSeconds)} · max ${formatRoleTtl(data.maxTtlSeconds)}`
    : `One-time passwords for ${data.defaultUser || 'the default user'} on port ${data.port}`;
  return (
    <Panel
      labelledBy="ssh-role-title"
      title={name}
      description={<span className="tabular-nums">{summary}</span>}
      actions={data.keyType === 'ca' ? (
        <Button size="sm" onClick={() => onSign(name)}>
          <i className="ri-quill-pen-line" aria-hidden="true" />
          Sign a key
        </Button>
      ) : (
        <Button size="sm" onClick={() => onOtp(name)}>
          <i className="ri-key-line" aria-hidden="true" />
          Create OTP
        </Button>
      )}
    >
      {/* Remount only when Vault returns different values, so a background refetch keeps unsaved edits. */}
      <SshRoleEditor
        key={JSON.stringify(data)}
        mount={mount}
        name={name}
        initial={roleToInput(data)}
        existingNames={existingNames}
        onSaved={() => undefined}
        onDeleted={() => onSelect(undefined)}
      />
    </Panel>
  );
}

/** Role list with the selected role's editor beside it. */
export default function SshRolesPanel(props: SshRolesPanelProps) {
  const { mount, selected, creating, caConfigured, onSelect, onCreate, onCancelCreate, onOpenCa, onSign, onOtp } = props;
  const roles = useSshRoles(mount);
  const names = roles.data?.map((role) => role.name) ?? [];

  if (roles.isPending) return <ContentSkeleton variant="list" label="Loading roles" />;
  if (roles.isError) {
    return <ErrorNotice title="Roles could not be listed" error={roles.error} permissionHint={`Your token needs list on ${mount}/roles.`} />;
  }

  const editor = creating && (
    <Panel labelledBy="ssh-new-role-title" title="New role">
      <SshRoleEditor
        mount={mount}
        initial={emptyCaRoleInput()}
        existingNames={names}
        onSaved={(name) => onSelect(name)}
        onCancel={onCancelCreate}
      />
    </Panel>
  );

  if (roles.data.length === 0 && !creating) {
    return (
      <EmptyState
        icon="ri-file-shield-2-line"
        title="No roles yet"
        action={(
          <>
            {caConfigured === false && <Button size="sm" onClick={onOpenCa}>Configure the CA</Button>}
            <Button size="sm" variant="primary" onClick={onCreate}>
              <i className="ri-add-line" aria-hidden="true" />
              Create role
            </Button>
          </>
        )}
      >
        {caConfigured === false
          ? 'Certificate roles need a signing CA, so configure the CA first. One-time password roles work without one.'
          : 'A role sets who can get a certificate or one-time password, for which users or hosts, and for how long.'}
      </EmptyState>
    );
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)]">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold text-foreground-900">Roles</h2>
          <Button size="sm" onClick={onCreate} disabled={creating}>
            <i className="ri-add-line" aria-hidden="true" />
            Create role
          </Button>
        </div>
        <RoleList roles={roles.data} selected={creating ? undefined : selected} onSelect={onSelect} />
        {caConfigured === false && roles.data.some((role) => role.keyType === 'ca') && (
          <Notice tone="warning">Certificate roles cannot sign until the signing CA is configured.</Notice>
        )}
      </div>
      <div className="min-w-0">
        {editor || (selected && names.includes(selected)
          ? <RoleDetail key={selected} mount={mount} name={selected} existingNames={names} onSelect={onSelect} onSign={onSign} onOtp={onOtp} />
          : selected
            ? <Notice tone="warning">There is no role named <span className="font-mono">{selected}</span> on this mount.</Notice>
            : <p className="rounded-lg border border-dashed border-background-300 px-4 py-6 text-center text-xs text-foreground-500">Select a role to view or edit it.</p>)}
      </div>
    </div>
  );
}
