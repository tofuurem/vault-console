import { useState, type FormEvent } from 'react';

import { useSaveConnection } from '@/application/engines/database/useDatabaseEngine';
import { useToast } from '@/application/notifications/ToastContext';
import Button from '@/components/base/Button';
import { Input, Textarea } from '@/components/base/Input';
import type { DatabaseConnection } from '@/domain/engines/database/database';
import { databaseErrorMessage } from '@/domain/engines/database/database-errors';
import {
  connectionFormErrors,
  connectionFormFromConnection,
  connectionInputFromForm,
  emptyConnectionForm,
  hasFormErrors,
  type ConnectionFormState,
  type FormErrors,
} from '@/domain/engines/database/database-forms';
import { connectionUrlWarning } from '@/domain/engines/database/database-validation';
import { databasePlugin, databasePluginLabel } from '@/domain/engines/database/plugins';
import { CheckboxField, FormCard, Notice, OptionalSection } from './DatabaseUi';
import PluginPicker from './PluginPicker';

interface ConnectionFormProps {
  readonly mount: string;
  /** Present when editing; absent when creating. */
  readonly connection?: DatabaseConnection;
  readonly existingNames: readonly string[];
  readonly onCancel: () => void;
  readonly onSaved: (name: string) => void;
}

type Update = (patch: Partial<ConnectionFormState>) => void;

function AddressFields({ form, errors, creating, update }: {
  readonly form: ConnectionFormState;
  readonly errors: FormErrors<ConnectionFormState>;
  readonly creating: boolean;
  readonly update: Update;
}) {
  const plugin = databasePlugin(form.pluginName);
  const urlLabel = plugin?.urlLabel ?? 'Connection URL';
  const templated = (plugin?.urlParameter ?? 'connection_url') === 'connection_url';
  const warning = connectionUrlWarning(form.connectionUrl);
  return (
    <>
      <div className="space-y-1.5">
        <Input
          label={urlLabel}
          value={form.connectionUrl}
          onChange={(event) => update({ connectionUrl: event.target.value })}
          placeholder={plugin?.urlTemplate ?? '{{username}}:{{password}}@host:port/database'}
          hint={templated
            ? 'Keep {{username}} and {{password}} in the URL. Vault fills them in from the fields below.'
            : undefined}
          error={errors.connectionUrl}
          autoComplete="off"
          spellCheck={false}
          monospace
        />
        {plugin && form.connectionUrl !== plugin.urlTemplate && (
          <Button type="button" size="sm" variant="ghost" onClick={() => update({ connectionUrl: plugin.urlTemplate })}>
            <i className="ri-file-copy-2-line" aria-hidden="true" />
            Use {plugin.label} example
          </Button>
        )}
        {warning && <Notice tone="warning">{warning}</Notice>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Username"
          value={form.username}
          onChange={(event) => update({ username: event.target.value })}
          hint="A database user dedicated to Vault, allowed to create and drop users."
          autoComplete="off"
          spellCheck={false}
          monospace
        />
        <Input
          label="Password"
          type="password"
          value={form.password}
          onChange={(event) => update({ password: event.target.value })}
          hint={creating
            ? 'Write-only. Vault stores it and never returns it.'
            : 'Leave empty to keep the current password. Vault never shows it.'}
          autoComplete="new-password"
          spellCheck={false}
        />
      </div>
    </>
  );
}

function AdvancedFields({ form, errors, creating, update }: {
  readonly form: ConnectionFormState;
  readonly errors: FormErrors<ConnectionFormState>;
  readonly creating: boolean;
  readonly update: Update;
}) {
  const plugin = databasePlugin(form.pluginName);
  return (
    <OptionalSection title="Advanced settings">
      <Input
        label="Password policy"
        value={form.passwordPolicy}
        onChange={(event) => update({ passwordPolicy: event.target.value })}
        placeholder="Plugin default"
        hint="Name of a Vault password policy used for generated passwords."
        spellCheck={false}
        monospace
      />
      <div className="space-y-1.5">
        <Textarea
          label="Root rotation statements"
          value={form.rootRotationStatements}
          onChange={(event) => update({ rootRotationStatements: event.target.value })}
          placeholder="Plugin default"
          rows={3}
          spellCheck={false}
          monospace
        />
        {plugin?.rootRotationStatements && !form.rootRotationStatements && (
          <Button type="button" size="sm" variant="ghost" onClick={() => update({ rootRotationStatements: plugin.rootRotationStatements })}>
            <i className="ri-file-copy-2-line" aria-hidden="true" />
            Use {plugin.label} template
          </Button>
        )}
      </div>
      <Textarea
        label="Plugin options (JSON)"
        value={form.extraSettings}
        onChange={(event) => update({ extraSettings: event.target.value })}
        placeholder={plugin?.extraSettingsExample ?? '{ "max_open_connections": 4 }'}
        rows={3}
        error={errors.extraSettings}
        spellCheck={false}
        monospace
      />
      <p className="-mt-2 text-[11px] leading-4 text-foreground-500">
        {creating
          ? 'Extra settings the plugin supports, such as connection limits or TLS options.'
          : 'Only the options you enter are changed. Vault keeps the rest.'}
      </p>
    </OptionalSection>
  );
}

/** Creates or edits a connection. The password is write-only and is never echoed back. */
export default function ConnectionForm({ mount, connection, existingNames, onCancel, onSaved }: ConnectionFormProps) {
  const creating = !connection;
  const toast = useToast();
  const save = useSaveConnection(mount);
  const [form, setForm] = useState(() => (connection ? connectionFormFromConnection(connection) : emptyConnectionForm()));
  const [showErrors, setShowErrors] = useState(false);
  const errors = connectionFormErrors(form, { creating, existingNames });
  const shownErrors = showErrors ? errors : {};

  const update: Update = (patch) => {
    setForm((current) => ({ ...current, ...patch }));
    if (save.isError) save.reset();
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setShowErrors(true);
    if (hasFormErrors(errors)) return;
    const input = connectionInputFromForm(form);
    save.mutate(input, {
      onSuccess: () => {
        setForm((current) => ({ ...current, password: '' }));
        toast.success(`Saved connection ${input.name}.`);
        onSaved(input.name);
      },
    });
  };

  return (
    <FormCard
      title={creating ? 'New connection' : `Edit ${connection.name}`}
      description={creating
        ? 'Tell Vault how to reach the database. Roles use this connection to create users.'
        : `${databasePluginLabel(connection.pluginName)} connection on ${mount}/.`}
    >
      <form noValidate onSubmit={submit}>
        <div className="space-y-4 p-4">
          {creating && (
            <Input
              label="Connection name"
              value={form.name}
              onChange={(event) => update({ name: event.target.value })}
              placeholder="app-postgres"
              error={shownErrors.name}
              autoComplete="off"
              spellCheck={false}
              monospace
            />
          )}
          {creating ? (
            <PluginPicker value={form.pluginName} error={shownErrors.pluginName} onChange={(pluginName) => update({ pluginName })} />
          ) : (
            <p className="text-xs text-foreground-600">
              Plugin <span className="font-mono text-foreground-900">{connection.pluginName}</span>
            </p>
          )}
          <AddressFields form={form} errors={shownErrors} creating={creating} update={update} />
          <Input
            label="Allowed roles"
            value={form.allowedRoles}
            onChange={(event) => update({ allowedRoles: event.target.value })}
            hint="Roles that may use this connection, separated by commas. Use * for any role, or a pattern such as app-*. Empty allows none."
            spellCheck={false}
            monospace
          />
          <CheckboxField
            label="Verify the connection when saving"
            description="Vault connects with these settings before it saves them."
            checked={form.verifyConnection}
            onChange={(verifyConnection) => update({ verifyConnection })}
          />
          <AdvancedFields form={form} errors={shownErrors} creating={creating} update={update} />
          {save.isError && (
            <Notice tone="danger" title="Connection was not saved">
              {databaseErrorMessage(save.error, `writing to ${mount}/config/${form.name.trim() || '…'}`)}
            </Notice>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-background-200 px-4 py-3">
          <Button type="button" size="sm" onClick={onCancel} disabled={save.isPending}>Cancel</Button>
          <Button type="submit" size="sm" variant="primary" loading={save.isPending}>
            {creating ? 'Create connection' : 'Save changes'}
          </Button>
        </div>
      </form>
    </FormCard>
  );
}
