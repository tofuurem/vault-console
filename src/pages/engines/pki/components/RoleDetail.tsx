import { useState, type ReactNode } from 'react';

import { useDeleteRole } from '@/application/engines/pki/usePkiMutations';
import { usePkiRole } from '@/application/engines/pki/usePkiQueries';
import { useToast } from '@/application/notifications/ToastContext';
import Button from '@/components/base/Button';
import ContentSkeleton from '@/components/base/ContentSkeleton';
import { useConfirmDialog } from '@/components/base/useConfirmDialog';
import { formatTtlSeconds } from '@/domain/engines/engines';
import type { PkiRole } from '@/domain/engines/pki/pki';
import { joinList, roleToInput } from '@/domain/engines/pki/pki-helpers';
import { normalizeVaultError } from '@/domain/vault/errors';
import { CARD_CLASS, LINK_BUTTON_CLASS } from '../pki-format';
import { roleFormState } from '../role-form';
import IssueCertificateDialog, { type CertificateRequestMode } from './IssueCertificateDialog';
import { ErrorNotice } from './Notices';
import RoleFormDialog from './RoleFormDialog';

function Setting({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="grid gap-0.5 py-1.5 sm:grid-cols-[180px_1fr] sm:gap-3">
      <dt className="text-foreground-500">{label}</dt>
      <dd className="min-w-0 break-words text-foreground-800">{children}</dd>
    </div>
  );
}

function yesNo(value: boolean): string {
  return value ? 'Yes' : 'No';
}

function nameRules(role: PkiRole): string {
  if (role.allowAnyName) return 'Any name';
  const rules = [
    role.allowBareDomains && 'the domains themselves',
    role.allowSubdomains && 'subdomains',
    role.allowGlobDomains && 'glob patterns',
    role.allowLocalhost && 'localhost',
    role.allowIpSans && 'IP addresses',
  ].filter(Boolean);
  return rules.length ? rules.join(', ') : 'Exact matches only';
}

function RoleSettings({ role }: { readonly role: PkiRole }) {
  const usages = [role.serverFlag && 'Server', role.clientFlag && 'Client', ...role.extKeyUsage].filter(Boolean);
  return (
    <dl className="divide-y divide-background-200 text-xs">
      <Setting label="Issuer"><span className="font-mono">{role.issuerRef}</span></Setting>
      <Setting label="Allowed domains"><span className="font-mono">{role.allowedDomains.length ? joinList(role.allowedDomains) : 'None'}</span></Setting>
      <Setting label="Also allows">{nameRules(role)}</Setting>
      <Setting label="Key">{role.keyType === 'any' ? 'Any type (CSR signing)' : `${role.keyType.toUpperCase()}${role.keyBits ? ` ${role.keyBits}` : ''}`}</Setting>
      <Setting label="Default TTL"><span className="tabular-nums">{formatTtlSeconds(role.ttlSeconds)}</span></Setting>
      <Setting label="Max TTL"><span className="tabular-nums">{formatTtlSeconds(role.maxTtlSeconds)}</span></Setting>
      <Setting label="Usage">{usages.length ? usages.join(', ') : 'None'}</Setting>
      <Setting label="Requires common name">{yesNo(role.requireCn)}</Setting>
      <Setting label="Stores certificates">{role.noStore ? 'No, certificates cannot be listed or revoked by serial' : 'Yes'}</Setting>
      {(role.organization.length > 0 || role.ou.length > 0) && (
        <Setting label="Subject">{[joinList(role.organization), joinList(role.ou)].filter(Boolean).join(' · ')}</Setting>
      )}
    </dl>
  );
}

/** One role: what it allows, plus issue, sign, edit, and delete. */
export default function RoleDetail({ mount, name, existingNames, onBack }: {
  readonly mount: string;
  readonly name: string;
  readonly existingNames: readonly string[];
  readonly onBack: () => void;
}) {
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirmDialog();
  const query = usePkiRole(mount, name);
  const remove = useDeleteRole(mount);
  const [request, setRequest] = useState<CertificateRequestMode>();
  const [editing, setEditing] = useState(false);
  const back = (
    <button type="button" className={LINK_BUTTON_CLASS} onClick={onBack}>
      <i className="ri-arrow-left-s-line" aria-hidden="true" />
      All roles
    </button>
  );

  if (query.isPending) return <div className="space-y-3">{back}<ContentSkeleton variant="detail" label="Loading role" /></div>;
  if (query.isError) {
    const missing = normalizeVaultError(query.error).code === 'not-found';
    return (
      <div className="space-y-3">
        {back}
        {missing
          ? <p className="text-xs text-foreground-600">No role named <span className="font-mono">{name}</span> exists on this mount.</p>
          : <ErrorNotice title="The role could not be read" error={query.error} permissionHint={`Your token needs read on ${mount}/roles/${name}.`} />}
      </div>
    );
  }

  const role = query.data;
  const deleteRole = async () => {
    const confirmed = await confirm({
      title: 'Delete role',
      message: `Delete ${name}? Certificates already issued stay valid, but no new ones can be issued from this role.`,
      confirmLabel: 'Delete role',
    });
    if (!confirmed) return;
    remove.mutate(name, {
      onSuccess: () => {
        toast.success(`Role ${name} deleted.`);
        onBack();
      },
      onError: (error) => toast.error(normalizeVaultError(error).message, { title: 'Delete failed' }),
    });
  };

  return (
    <div className="space-y-4">
      {back}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-mono text-sm font-semibold text-foreground-900">{name}</h2>
          <p className="mt-0.5 text-xs text-foreground-500">Role on {mount}/</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {role.keyType !== 'any' && (
            <Button size="sm" variant="primary" onClick={() => setRequest('issue')}>
              <i className="ri-add-line" aria-hidden="true" />
              Issue certificate
            </Button>
          )}
          <Button size="sm" onClick={() => setRequest('sign')}>
            <i className="ri-quill-pen-line" aria-hidden="true" />
            Sign CSR
          </Button>
          <Button size="sm" onClick={() => setEditing(true)}>
            <i className="ri-edit-line" aria-hidden="true" />
            Edit
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void deleteRole()} loading={remove.isPending}>
            <i className="ri-delete-bin-line" aria-hidden="true" />
            Delete
          </Button>
        </div>
      </header>
      <section aria-label="Role settings" className={`${CARD_CLASS} px-4 py-2`}>
        <RoleSettings role={role} />
      </section>
      {request && <IssueCertificateDialog key={request} mount={mount} role={role} mode={request} open onClose={() => setRequest(undefined)} />}
      {editing && (
        <RoleFormDialog
          mount={mount}
          open
          mode="update"
          initial={roleFormState(name, roleToInput(role))}
          existingNames={existingNames}
          onClose={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      )}
      {confirmDialog}
    </div>
  );
}
