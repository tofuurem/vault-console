import { useState, type FormEvent } from 'react';

import { useSaveRole } from '@/application/engines/pki/usePkiMutations';
import { usePkiIssuers } from '@/application/engines/pki/usePkiQueries';
import { useToast } from '@/application/notifications/ToastContext';
import Button from '@/components/base/Button';
import { Input, Textarea } from '@/components/base/Input';
import Modal from '@/components/base/Modal';
import { PKI_DEFAULT_KEY_BITS, PKI_KEY_BITS, type PkiRoleKeyType } from '@/domain/engines/pki/pki';
import { issuerLabel } from '@/domain/engines/pki/pki-helpers';
import { ROLE_KEY_TYPES, roleFormErrors, roleInput, type RoleFormErrors, type RoleFormState } from '../role-form';
import { CheckboxField, DialogFooter, FormSection, SelectField } from './FormControls';
import { ErrorNotice } from './Notices';

type Patch = (patch: Partial<RoleFormState>) => void;

function NameFields({ mount, form, errors, mode, onChange }: {
  readonly mount: string;
  readonly form: RoleFormState;
  readonly errors: RoleFormErrors;
  readonly mode: 'create' | 'update';
  readonly onChange: Patch;
}) {
  const issuers = usePkiIssuers(mount);
  const options = [
    { value: 'default', label: 'Default issuer' },
    ...(issuers.data ?? []).map((issuer) => ({ value: issuer.name || issuer.id, label: issuerLabel(issuer) })),
  ];
  if (!options.some((option) => option.value === form.issuerRef)) options.push({ value: form.issuerRef, label: form.issuerRef });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {mode === 'create' && (
        <Input label="Role name" value={form.name} onChange={(event) => onChange({ name: event.target.value })} error={errors.name} placeholder="web-server" spellCheck={false} autoComplete="off" monospace />
      )}
      <SelectField label="Issuer" value={form.issuerRef} onChange={(event) => onChange({ issuerRef: event.target.value })} options={options} />
    </div>
  );
}

function DomainFields({ form, errors, onChange }: { readonly form: RoleFormState; readonly errors: RoleFormErrors; readonly onChange: Patch }) {
  return (
    <FormSection title="Allowed names" description="Which common names and alternative names certificates from this role may contain.">
      <Textarea
        label="Allowed domains"
        value={form.allowedDomains}
        onChange={(event) => onChange({ allowedDomains: event.target.value })}
        rows={3}
        placeholder={'example.com\ninternal.example.com'}
        error={errors.allowedDomains}
        spellCheck={false}
        disabled={form.allowAnyName}
        monospace
      />
      <div className="grid gap-x-4 sm:grid-cols-2">
        <CheckboxField label="Subdomains" description="app.example.com for example.com" checked={form.allowSubdomains} onChange={(allowSubdomains) => onChange({ allowSubdomains })} disabled={form.allowAnyName} />
        <CheckboxField label="Bare domains" description="example.com itself" checked={form.allowBareDomains} onChange={(allowBareDomains) => onChange({ allowBareDomains })} disabled={form.allowAnyName} />
        <CheckboxField label="Glob patterns" description="Treat entries like *.example.com as patterns" checked={form.allowGlobDomains} onChange={(allowGlobDomains) => onChange({ allowGlobDomains })} disabled={form.allowAnyName} />
        <CheckboxField label="Any name" description="Skip domain checks entirely" checked={form.allowAnyName} onChange={(allowAnyName) => onChange({ allowAnyName })} />
        <CheckboxField label="localhost" checked={form.allowLocalhost} onChange={(allowLocalhost) => onChange({ allowLocalhost })} />
        <CheckboxField label="IP addresses" description="Allow IP alternative names" checked={form.allowIpSans} onChange={(allowIpSans) => onChange({ allowIpSans })} />
      </div>
    </FormSection>
  );
}

function KeyAndLifetimeFields({ form, errors, onChange }: { readonly form: RoleFormState; readonly errors: RoleFormErrors; readonly onChange: Patch }) {
  return (
    <FormSection title="Key and lifetime">
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label="Key type"
          value={form.keyType}
          options={ROLE_KEY_TYPES}
          onChange={(event) => {
            const keyType = event.target.value as PkiRoleKeyType;
            onChange({ keyType, keyBits: PKI_DEFAULT_KEY_BITS[keyType] });
          }}
        />
        <SelectField
          label="Key size"
          value={String(form.keyBits)}
          disabled={form.keyType === 'ed25519' || form.keyType === 'any'}
          options={PKI_KEY_BITS[form.keyType].map((bits) => ({ value: String(bits), label: bits === 0 ? 'Not applicable' : `${bits} bits` }))}
          onChange={(event) => onChange({ keyBits: Number(event.target.value) })}
        />
        <Input label="Default TTL" value={form.ttl} onChange={(event) => onChange({ ttl: event.target.value })} error={errors.ttl} placeholder="Mount default" hint="Used when a request names no TTL." spellCheck={false} monospace />
        <Input label="Max TTL" value={form.maxTtl} onChange={(event) => onChange({ maxTtl: event.target.value })} error={errors.maxTtl} placeholder="Mount maximum" spellCheck={false} monospace />
      </div>
    </FormSection>
  );
}

function UsageFields({ form, onChange }: { readonly form: RoleFormState; readonly onChange: Patch }) {
  return (
    <FormSection title="Usage and subject">
      <div className="grid gap-x-4 sm:grid-cols-2">
        <CheckboxField label="Server authentication" description="TLS servers" checked={form.serverFlag} onChange={(serverFlag) => onChange({ serverFlag })} />
        <CheckboxField label="Client authentication" description="Mutual TLS clients" checked={form.clientFlag} onChange={(clientFlag) => onChange({ clientFlag })} />
        <CheckboxField label="Require a common name" checked={form.requireCn} onChange={(requireCn) => onChange({ requireCn })} />
        <CheckboxField
          label="Do not store certificates"
          description="Faster for short-lived certificates, but they cannot be listed or revoked by serial."
          checked={form.noStore}
          onChange={(noStore) => onChange({ noStore })}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Input label="Extra extended key usages" value={form.extKeyUsage} onChange={(event) => onChange({ extKeyUsage: event.target.value })} placeholder="CodeSigning" hint="Comma-separated Go names." spellCheck={false} monospace />
        <Input label="Organization" value={form.organization} onChange={(event) => onChange({ organization: event.target.value })} hint="Comma-separated." />
        <Input label="Organizational unit" value={form.ou} onChange={(event) => onChange({ ou: event.target.value })} hint="Comma-separated." />
      </div>
    </FormSection>
  );
}

/** Creates a role or edits one; edits keep settings this form does not show. */
export default function RoleFormDialog({ mount, open, mode, initial, existingNames, onClose, onSaved }: {
  readonly mount: string;
  readonly open: boolean;
  readonly mode: 'create' | 'update';
  readonly initial: RoleFormState;
  readonly existingNames: readonly string[];
  readonly onClose: () => void;
  readonly onSaved: (name: string) => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState(initial);
  const [showErrors, setShowErrors] = useState(false);
  const mutation = useSaveRole(mount);
  const errors = roleFormErrors(form, mode, existingNames);
  const onChange: Patch = (patch) => setForm((current) => ({ ...current, ...patch }));

  const close = () => {
    if (mutation.isPending) return;
    mutation.reset();
    onClose();
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setShowErrors(true);
    if (Object.keys(errors).length > 0) return;
    const name = form.name.trim();
    mutation.mutate({ name, input: roleInput(form), mode }, {
      onSuccess: () => {
        toast.success(mode === 'create' ? `Role ${name} created.` : `Role ${name} saved.`);
        onSaved(name);
      },
    });
  };
  const visibleErrors = showErrors ? errors : {};

  return (
    <Modal open={open} onClose={close} title={mode === 'create' ? 'Create role' : `Edit ${form.name}`} width="lg">
      <form onSubmit={submit} noValidate>
        <div className="space-y-5 p-4">
          <NameFields mount={mount} form={form} errors={visibleErrors} mode={mode} onChange={onChange} />
          <DomainFields form={form} errors={visibleErrors} onChange={onChange} />
          <KeyAndLifetimeFields form={form} errors={visibleErrors} onChange={onChange} />
          <UsageFields form={form} onChange={onChange} />
          {mutation.isError && <ErrorNotice title="The role was not saved" error={mutation.error} permissionHint={`Your token needs create and update on ${mount}/roles/${form.name.trim() || '…'}.`} />}
        </div>
        <DialogFooter>
          <Button type="button" size="sm" onClick={close} disabled={mutation.isPending}>Cancel</Button>
          <Button type="submit" size="sm" variant="primary" loading={mutation.isPending}>{mode === 'create' ? 'Create role' : 'Save role'}</Button>
        </DialogFooter>
      </form>
    </Modal>
  );
}
