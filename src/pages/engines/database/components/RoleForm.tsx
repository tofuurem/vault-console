import { useState, type FormEvent } from 'react';

import { useDatabaseConnection, useSaveRole } from '@/application/engines/database/useDatabaseEngine';
import { useToast } from '@/application/notifications/ToastContext';
import Button from '@/components/base/Button';
import { Input, Textarea } from '@/components/base/Input';
import { useConfirmDialog } from '@/components/base/useConfirmDialog';
import type { DatabaseRole } from '@/domain/engines/database/database';
import { databaseErrorMessage } from '@/domain/engines/database/database-errors';
import { connectionAllowsRole } from '@/domain/engines/database/database-format';
import {
  emptyRoleForm,
  hasFormErrors,
  roleFormErrors,
  roleFormFromRole,
  roleInputFromForm,
  type FormErrors,
  type RoleFormState,
} from '@/domain/engines/database/database-forms';
import { DATABASE_PLUGINS, databasePlugin, DEFAULT_DATABASE_PLUGIN } from '@/domain/engines/database/plugins';
import ConnectionField from './ConnectionField';
import { FormCard, Notice, OptionalSection, SelectField } from './DatabaseUi';

interface RoleFormProps {
  readonly mount: string;
  readonly role?: DatabaseRole;
  readonly existingNames: readonly string[];
  readonly connectionNames: readonly string[] | undefined;
  readonly initialConnection?: string;
  readonly onCancel: () => void;
  readonly onSaved: (name: string) => void;
  readonly onAddConnection: () => void;
}

type Update = (patch: Partial<RoleFormState>) => void;

function StatementFields({ form, errors, update, onTemplate, templateId, setTemplateId }: {
  readonly form: RoleFormState;
  readonly errors: FormErrors<RoleFormState>;
  readonly update: Update;
  readonly onTemplate: () => void;
  readonly templateId: string;
  readonly setTemplateId: (id: string) => void;
}) {
  const json = databasePlugin(templateId)?.statementFormat === 'json';
  return (
    <>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 sm:max-w-xs">
          <SelectField label="Statement template" value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
            {DATABASE_PLUGINS.map((plugin) => <option key={plugin.id} value={plugin.id}>{plugin.label}</option>)}
          </SelectField>
        </div>
        <Button type="button" size="sm" onClick={onTemplate}>
          <i className="ri-file-copy-2-line" aria-hidden="true" />
          Use template
        </Button>
      </div>
      <Textarea
        label="Creation statements"
        value={form.creationStatements}
        onChange={(event) => update({ creationStatements: event.target.value })}
        rows={5}
        placeholder={json ? 'JSON role definition' : 'CREATE ROLE "{{name}}" …'}
        error={errors.creationStatements}
        spellCheck={false}
        monospace
      />
      <p className="-mt-2 text-[11px] leading-4 text-foreground-500">
        Vault replaces {'{{name}}'}, {'{{password}}'}, and {'{{expiration}}'} for each new user.
      </p>
      <OptionalSection title="Revocation, rollback, and renew statements">
        <Textarea
          label="Revocation statements"
          value={form.revocationStatements}
          onChange={(event) => update({ revocationStatements: event.target.value })}
          rows={3}
          placeholder="Plugin default: drop the user"
          spellCheck={false}
          monospace
        />
        <Textarea
          label="Rollback statements"
          value={form.rollbackStatements}
          onChange={(event) => update({ rollbackStatements: event.target.value })}
          rows={2}
          placeholder="Run if user creation fails partway"
          spellCheck={false}
          monospace
        />
        <Textarea
          label="Renew statements"
          value={form.renewStatements}
          onChange={(event) => update({ renewStatements: event.target.value })}
          rows={2}
          placeholder="Run when a lease is renewed"
          spellCheck={false}
          monospace
        />
      </OptionalSection>
    </>
  );
}

function initialForm(role: DatabaseRole | undefined, connectionNames: readonly string[] | undefined, initialConnection?: string) {
  if (role) return roleFormFromRole(role);
  return emptyRoleForm(initialConnection ?? (connectionNames?.length === 1 ? connectionNames[0] : ''));
}

/** Creates or edits a dynamic role. */
export default function RoleForm({
  mount,
  role,
  existingNames,
  connectionNames,
  initialConnection,
  onCancel,
  onSaved,
  onAddConnection,
}: RoleFormProps) {
  const creating = !role;
  const toast = useToast();
  const save = useSaveRole(mount);
  const [confirm, confirmDialog] = useConfirmDialog();
  const [form, setForm] = useState(() => initialForm(role, connectionNames, initialConnection));
  const [showErrors, setShowErrors] = useState(false);
  const connection = useDatabaseConnection(mount, form.dbName.trim() || undefined);
  const [chosenTemplate, setChosenTemplate] = useState<string>();
  const templateId = chosenTemplate
    ?? (connection.data && databasePlugin(connection.data.pluginName) ? connection.data.pluginName : DEFAULT_DATABASE_PLUGIN.id);
  const errors = roleFormErrors(form, { creating, existingNames });
  const shownErrors = showErrors ? errors : {};
  const roleName = form.name.trim();
  const notAllowed = connection.data && roleName && !connectionAllowsRole(connection.data.allowedRoles, roleName);

  if (creating && connectionNames?.length === 0) {
    return (
      <FormCard title="New role">
        <div className="space-y-3 p-4">
          <Notice>Add a connection first, then create roles. A role needs a connection to create database users.</Notice>
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
  const applyTemplate = async () => {
    const plugin = databasePlugin(templateId) ?? DEFAULT_DATABASE_PLUGIN;
    if (form.creationStatements.trim() || form.revocationStatements.trim()) {
      const confirmed = await confirm({
        title: 'Replace statements',
        message: `Replace the creation and revocation statements with the ${plugin.label} template?`,
        confirmLabel: 'Replace',
      });
      if (!confirmed) return;
    }
    update({ creationStatements: plugin.creationStatements, revocationStatements: plugin.revocationStatements });
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setShowErrors(true);
    if (hasFormErrors(errors)) return;
    const input = roleInputFromForm(form);
    save.mutate(input, {
      onSuccess: () => {
        toast.success(`Saved role ${input.name}.`);
        onSaved(input.name);
      },
    });
  };

  return (
    <FormCard
      title={creating ? 'New role' : `Edit ${role.name}`}
      description="Applications request credentials from a role. Each request creates a new database user that Vault drops when its lease ends."
    >
      <form noValidate onSubmit={submit}>
        <div className="space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {creating ? (
              <Input
                label="Role name"
                value={form.name}
                onChange={(event) => update({ name: event.target.value })}
                placeholder="readonly"
                error={shownErrors.name}
                autoComplete="off"
                spellCheck={false}
                monospace
              />
            ) : (
              <Input label="Role name" value={role.name} readOnly disabled monospace />
            )}
            <ConnectionField
              value={form.dbName}
              connectionNames={connectionNames}
              error={shownErrors.dbName}
              onChange={(dbName) => update({ dbName })}
            />
          </div>
          {notAllowed && (
            <Notice tone="warning">
              The connection {form.dbName} does not allow the role {roleName}. Add it to the connection's allowed roles, or
              Vault will refuse to issue credentials.
            </Notice>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Default TTL"
              value={form.defaultTtl}
              onChange={(event) => update({ defaultTtl: event.target.value })}
              placeholder="Engine default"
              hint="How long credentials last unless renewed."
              error={shownErrors.defaultTtl}
              className="tabular-nums"
              monospace
            />
            <Input
              label="Max TTL"
              value={form.maxTtl}
              onChange={(event) => update({ maxTtl: event.target.value })}
              placeholder="Engine default"
              hint="Renewals cannot extend credentials past this."
              error={shownErrors.maxTtl}
              className="tabular-nums"
              monospace
            />
          </div>
          <StatementFields
            form={form}
            errors={shownErrors}
            update={update}
            onTemplate={() => void applyTemplate()}
            templateId={templateId}
            setTemplateId={setChosenTemplate}
          />
          {save.isError && (
            <Notice tone="danger" title="Role was not saved">
              {databaseErrorMessage(save.error, `writing to ${mount}/roles/${roleName || '…'}`)}
            </Notice>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-background-200 px-4 py-3">
          <Button type="button" size="sm" onClick={onCancel} disabled={save.isPending}>Cancel</Button>
          <Button type="submit" size="sm" variant="primary" loading={save.isPending}>
            {creating ? 'Create role' : 'Save changes'}
          </Button>
        </div>
      </form>
      {confirmDialog}
    </FormCard>
  );
}
