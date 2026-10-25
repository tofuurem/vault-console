import { useState, type FormEvent } from 'react';

import { useDeleteSshRole, useWriteSshRole } from '@/application/engines/ssh/useSsh';
import { useToast } from '@/application/notifications/ToastContext';
import Button from '@/components/base/Button';
import { Input } from '@/components/base/Input';
import { useConfirmDialog } from '@/components/base/useConfirmDialog';
import type { SshRoleInput, SshRoleKeyType } from '@/domain/engines/ssh/ssh';
import { emptyRoleInput, sshRoleNameError } from '@/domain/engines/ssh/ssh-roles';
import { normalizeVaultError } from '@/domain/vault/errors';
import { roleDraft, roleInputFromDraft, type RoleDraft, type RoleDraftErrors } from '../role-draft';
import SshCaRoleFields from './SshCaRoleFields';
import SshOtpRoleFields from './SshOtpRoleFields';
import { ErrorNotice, Segmented } from './ssh-ui';

interface SshRoleEditorProps {
  readonly mount: string;
  /** Existing role name; undefined creates a new role. */
  readonly name?: string;
  readonly initial: SshRoleInput;
  readonly existingNames: readonly string[];
  readonly onSaved: (name: string) => void;
  readonly onDeleted?: () => void;
  readonly onCancel?: () => void;
}

/** Create or edit a CA or OTP role. Saving replaces the whole role in Vault. */
export default function SshRoleEditor({ mount, name, initial, existingNames, onSaved, onDeleted, onCancel }: SshRoleEditorProps) {
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirmDialog();
  const write = useWriteSshRole(mount);
  const remove = useDeleteSshRole(mount);
  const [roleName, setRoleName] = useState(name ?? '');
  const [draft, setDraft] = useState<RoleDraft>(() => roleDraft(initial));
  const [errors, setErrors] = useState<RoleDraftErrors>({});
  const [nameError, setNameError] = useState<string>();
  const creating = name === undefined;

  const patch = (next: Partial<RoleDraft>) => setDraft((current) => ({ ...current, ...next }) as RoleDraft);
  const switchType = (keyType: SshRoleKeyType) => {
    setDraft(roleDraft(emptyRoleInput(keyType)));
    setErrors({});
    write.reset();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = roleName.trim();
    const nextNameError = creating
      ? sshRoleNameError(trimmed) ?? (existingNames.includes(trimmed) ? 'A role with this name already exists.' : undefined)
      : undefined;
    setNameError(nextNameError);
    const result = roleInputFromDraft(draft);
    setErrors(result.ok ? {} : result.errors);
    if (nextNameError || !result.ok) return;
    write.mutate({ name: trimmed, input: result.input }, {
      onSuccess: () => {
        toast.success(creating ? `Created role ${trimmed}.` : `Saved role ${trimmed}.`);
        onSaved(trimmed);
      },
    });
  };

  const deleteRole = async () => {
    if (!name) return;
    const confirmed = await confirm({
      title: 'Delete role',
      message: `Delete ${name}? Certificates it already signed stay valid until they expire, but no new ones can be issued.`,
      confirmLabel: 'Delete role',
    });
    if (!confirmed) return;
    remove.mutate(name, {
      onSuccess: () => {
        toast.success(`Deleted role ${name}.`);
        onDeleted?.();
      },
      onError: (error) => {
        const vaultError = normalizeVaultError(error);
        toast.error(vaultError.reason ?? vaultError.message, { title: 'Role was not deleted' });
      },
    });
  };

  return (
    <>
      <form onSubmit={submit} className="space-y-4" aria-label={creating ? 'New role' : `Role ${name}`} noValidate>
        {creating && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Role name"
              value={roleName}
              onChange={(event) => setRoleName(event.target.value)}
              error={nameError}
              autoComplete="off"
              spellCheck={false}
              monospace
            />
            <Segmented<SshRoleKeyType>
              label="Type"
              value={draft.keyType}
              onChange={switchType}
              options={[{ value: 'ca', label: 'Signed certificates' }, { value: 'otp', label: 'One-time passwords' }]}
            />
          </div>
        )}
        {draft.keyType === 'ca'
          ? <SshCaRoleFields draft={draft} errors={errors} onChange={patch} />
          : <SshOtpRoleFields draft={draft} errors={errors} onChange={patch} />}
        {write.isError && (
          <ErrorNotice
            title="The role was not saved"
            error={write.error}
            permissionHint={`Your token needs ${creating ? 'create' : 'update'} on ${mount}/roles/${roleName.trim() || '…'}.`}
            requestHint="Check the durations, CIDR blocks, and option names."
          />
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-background-200 pt-3">
          <div>
            {!creating && (
              <Button type="button" size="sm" variant="ghost" onClick={() => void deleteRole()} loading={remove.isPending}>
                <i className="ri-delete-bin-line text-danger-600" aria-hidden="true" />
                Delete role
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {onCancel && <Button type="button" size="sm" onClick={onCancel} disabled={write.isPending}>Cancel</Button>}
            <Button type="submit" size="sm" variant="primary" loading={write.isPending}>
              {creating ? 'Create role' : 'Save changes'}
            </Button>
          </div>
        </div>
      </form>
      {confirmDialog}
    </>
  );
}
