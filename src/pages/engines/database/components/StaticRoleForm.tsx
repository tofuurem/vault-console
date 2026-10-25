import { useState, type FormEvent } from 'react';

import { useDatabaseConnection, useSaveStaticRole } from '@/application/engines/database/useDatabaseEngine';
import { useToast } from '@/application/notifications/ToastContext';
import Button from '@/components/base/Button';
import { Input, Textarea } from '@/components/base/Input';
import type { DatabaseStaticRole } from '@/domain/engines/database/database';
import { databaseErrorMessage } from '@/domain/engines/database/database-errors';
import {
  emptyStaticRoleForm,
  hasFormErrors,
  staticRoleFormErrors,
  staticRoleFormFromRole,
  staticRoleInputFromForm,
  type FormErrors,
  type StaticRoleFormState,
} from '@/domain/engines/database/database-forms';
import { databasePlugin } from '@/domain/engines/database/plugins';
import ConnectionField from './ConnectionField';
import { FormCard, Notice } from './DatabaseUi';

interface StaticRoleFormProps {
  readonly mount: string;
  readonly role?: DatabaseStaticRole;
  readonly existingNames: readonly string[];
  readonly connectionNames: readonly string[] | undefined;
  readonly initialConnection?: string;
  readonly onCancel: () => void;
  readonly onSaved: (name: string) => void;
  readonly onAddConnection: () => void;
}

type Update = (patch: Partial<StaticRoleFormState>) => void;

const ROTATION_KINDS = [
  { key: 'period', label: 'Every period', description: 'Rotate on a fixed interval, such as every 24h.' },
  { key: 'schedule', label: 'On a schedule', description: 'Rotate at set times using a cron expression.' },
] as const;

function RotationFields({ form, errors, update }: {
  readonly form: StaticRoleFormState;
  readonly errors: FormErrors<StaticRoleFormState>;
  readonly update: Update;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-1.5 text-xs font-medium text-foreground-700">Rotation</legend>
      <div role="radiogroup" aria-label="Rotation" className="grid gap-1.5 sm:grid-cols-2">
        {ROTATION_KINDS.map((kind) => {
          const active = form.rotationKind === kind.key;
          return (
            <button
              key={kind.key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => update({ rotationKind: kind.key })}
              className={`rounded-md border p-2.5 text-left transition-[border-color,background-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 ${
                active ? 'border-primary-400 bg-primary-50' : 'border-background-300 bg-background-50 hover:bg-background-100'
              }`}
            >
              <span className="block text-xs font-semibold text-foreground-900">{kind.label}</span>
              <span className="mt-0.5 block text-[11px] leading-4 text-foreground-600">{kind.description}</span>
            </button>
          );
        })}
      </div>
      {form.rotationKind === 'period' ? (
        <div className="sm:max-w-xs">
          <Input
            label="Rotation period"
            value={form.rotationPeriod}
            onChange={(event) => update({ rotationPeriod: event.target.value })}
            placeholder="24h"
            error={errors.rotationPeriod}
            className="tabular-nums"
            monospace
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Cron schedule"
            value={form.rotationSchedule}
            onChange={(event) => update({ rotationSchedule: event.target.value })}
            placeholder="0 3 * * SAT"
            hint="Minute, hour, day of month, month, day of week."
            error={errors.rotationSchedule}
            spellCheck={false}
            monospace
          />
          <Input
            label="Rotation window"
            value={form.rotationWindow}
            onChange={(event) => update({ rotationWindow: event.target.value })}
            placeholder="No limit"
            hint="How long after the scheduled time Vault may still rotate. At least 1h."
            error={errors.rotationWindow}
            className="tabular-nums"
            monospace
          />
        </div>
      )}
    </fieldset>
  );
}

/** Creates or edits a static role. The username cannot change after creation. */
export default function StaticRoleForm({
  mount,
  role,
  existingNames,
  connectionNames,
  initialConnection,
  onCancel,
  onSaved,
  onAddConnection,
}: StaticRoleFormProps) {
  const creating = !role;
  const toast = useToast();
  const save = useSaveStaticRole(mount);
  const [form, setForm] = useState(() => (role
    ? staticRoleFormFromRole(role)
    : emptyStaticRoleForm(initialConnection ?? (connectionNames?.length === 1 ? connectionNames[0] : ''))));
  const [showErrors, setShowErrors] = useState(false);
  const connection = useDatabaseConnection(mount, form.dbName.trim() || undefined);
  const plugin = connection.data ? databasePlugin(connection.data.pluginName) : undefined;
  const errors = staticRoleFormErrors(form, { creating, existingNames });
  const shownErrors = showErrors ? errors : {};

  if (creating && connectionNames?.length === 0) {
    return (
      <FormCard title="New static role">
        <div className="space-y-3 p-4">
          <Notice>Add a connection first, then create static roles. Vault uses the connection to change the user's password.</Notice>
          <Button size="sm" variant="primary" onClick={onAddConnection}>
            <i className="ri-add-line" aria-hidden="true" />
            Add connection
          </Button>
        </div>
      </FormCard>
    );
  }

  const update: Update = (patch) => {
    setForm((current) => ({ ...current, ...patch }));
    if (save.isError) save.reset();
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setShowErrors(true);
    if (hasFormErrors(errors)) return;
    const input = staticRoleInputFromForm(form);
    save.mutate(input, {
      onSuccess: () => {
        toast.success(`Saved static role ${input.name}.`);
        onSaved(input.name);
      },
    });
  };

  return (
    <FormCard
      title={creating ? 'New static role' : `Edit ${role.name}`}
      description="Vault takes over the password of one existing database user and rotates it. Applications read the current password from Vault."
    >
      <form noValidate onSubmit={submit}>
        <div className="space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Role name"
              value={creating ? form.name : role.name}
              onChange={(event) => update({ name: event.target.value })}
              placeholder="app-service"
              error={shownErrors.name}
              readOnly={!creating}
              disabled={!creating}
              autoComplete="off"
              spellCheck={false}
              monospace
            />
            <ConnectionField
              value={form.dbName}
              connectionNames={connectionNames}
              error={shownErrors.dbName}
              onChange={(dbName) => update({ dbName })}
            />
          </div>
          <Input
            label="Database user"
            value={form.username}
            onChange={(event) => update({ username: event.target.value })}
            placeholder="app_service"
            hint={creating
              ? 'The user must already exist in the database.'
              : 'Vault does not allow changing the user of a static role. Create a new role instead.'}
            error={shownErrors.username}
            readOnly={!creating}
            disabled={!creating}
            autoComplete="off"
            spellCheck={false}
            monospace
          />
          <RotationFields form={form} errors={shownErrors} update={update} />
          <div className="space-y-1.5">
            <Textarea
              label="Rotation statements"
              value={form.rotationStatements}
              onChange={(event) => update({ rotationStatements: event.target.value })}
              rows={3}
              placeholder="Plugin default"
              spellCheck={false}
              monospace
            />
            {plugin?.rotationStatements && !form.rotationStatements && (
              <Button type="button" size="sm" variant="ghost" onClick={() => update({ rotationStatements: plugin.rotationStatements })}>
                <i className="ri-file-copy-2-line" aria-hidden="true" />
                Use {plugin.label} template
              </Button>
            )}
          </div>
          {creating && (
            <Notice tone="warning">
              Vault changes this user's password as soon as the role is created. Anything using the current password
              loses access until it reads the new one from Vault.
            </Notice>
          )}
          {save.isError && (
            <Notice tone="danger" title="Static role was not saved">
              {databaseErrorMessage(save.error, `writing to ${mount}/static-roles/${form.name.trim() || '…'}`)}
            </Notice>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-background-200 px-4 py-3">
          <Button type="button" size="sm" onClick={onCancel} disabled={save.isPending}>Cancel</Button>
          <Button type="submit" size="sm" variant="primary" loading={save.isPending}>
            {creating ? 'Create static role' : 'Save changes'}
          </Button>
        </div>
      </form>
    </FormCard>
  );
}
