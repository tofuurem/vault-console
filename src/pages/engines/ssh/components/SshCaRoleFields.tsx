import type { ReactNode } from 'react';

import { Input, Textarea } from '@/components/base/Input';
import { durationError } from '@/domain/engines/engines';
import { SSH_ALGORITHM_SIGNERS } from '@/domain/engines/ssh/ssh';
import { SSH_STANDARD_EXTENSIONS } from '@/domain/engines/ssh/ssh-keys';
import type { CaRoleDraft, RoleDraftErrors } from '../role-draft';
import { CHECKBOX_CLASS, Checkbox, Select } from './ssh-ui';

interface FieldsProps {
  readonly draft: CaRoleDraft;
  readonly errors: RoleDraftErrors;
  readonly onChange: (patch: Partial<CaRoleDraft>) => void;
}

function Group({ title, description, children }: { readonly title: string; readonly description?: string; readonly children: ReactNode }) {
  return (
    <fieldset className="space-y-3 border-t border-background-200 pt-3 first:border-t-0 first:pt-0">
      <legend className="sr-only">{title}</legend>
      <div aria-hidden="true">
        <p className="text-xs font-semibold text-foreground-800">{title}</p>
        {description && <p className="mt-0.5 text-[11px] leading-4 text-foreground-500">{description}</p>}
      </div>
      {children}
    </fieldset>
  );
}

function toggle(values: readonly string[], name: string, on: boolean): readonly string[] {
  return on ? [...new Set([...values, name])] : values.filter((value) => value !== name);
}

function ExtensionsTable({ draft, errors, onChange }: FieldsProps) {
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border border-background-300">
        <table className="w-full text-left text-xs">
          <thead className="bg-background-100 text-[11px] text-foreground-600">
            <tr>
              <th scope="col" className="px-3 py-1.5 font-medium">Extension</th>
              <th scope="col" className="w-20 px-2 py-1.5 text-center font-medium">Allowed</th>
              <th scope="col" className="w-20 px-2 py-1.5 text-center font-medium">Default</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-background-200">
            {SSH_STANDARD_EXTENSIONS.map((extension) => {
              const allowed = draft.allowedStandard.includes(extension.name);
              const byDefault = draft.defaultStandard.includes(extension.name);
              return (
                <tr key={extension.name}>
                  <th scope="row" className="px-3 py-1.5 font-normal">
                    <span className="block font-mono text-[11px] text-foreground-800">{extension.name}</span>
                    <span className="block text-[11px] text-foreground-500">{extension.label}</span>
                  </th>
                  <td className="text-center">
                    <label className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center sm:min-h-8">
                      <input
                        type="checkbox"
                        aria-label={`Allow ${extension.name}`}
                        checked={allowed}
                        onChange={(event) => onChange({
                          allowedStandard: toggle(draft.allowedStandard, extension.name, event.target.checked),
                          ...(event.target.checked ? {} : { defaultStandard: toggle(draft.defaultStandard, extension.name, false) }),
                        })}
                        className={CHECKBOX_CLASS}
                      />
                    </label>
                  </td>
                  <td className="text-center">
                    <label className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center sm:min-h-8">
                      <input
                        type="checkbox"
                        aria-label={`Grant ${extension.name} by default`}
                        checked={byDefault}
                        onChange={(event) => onChange({
                          defaultStandard: toggle(draft.defaultStandard, extension.name, event.target.checked),
                          ...(event.target.checked ? { allowedStandard: toggle(draft.allowedStandard, extension.name, true) } : {}),
                        })}
                        className={CHECKBOX_CLASS}
                      />
                    </label>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Other allowed extensions"
          value={draft.otherAllowedExtensions}
          onChange={(event) => onChange({ otherAllowedExtensions: event.target.value })}
          hint="Comma-separated; * allows any extension."
          spellCheck={false}
          monospace
        />
        <Textarea
          label="Other default extensions"
          value={draft.otherDefaultExtensions}
          onChange={(event) => onChange({ otherDefaultExtensions: event.target.value })}
          rows={2}
          placeholder="name or name=value, one per line"
          error={errors.otherDefaultExtensions}
          spellCheck={false}
          monospace
        />
      </div>
    </div>
  );
}

function UserFields({ draft, onChange }: FieldsProps) {
  return (
    <Group title="Users" description="Principals are the login names a user certificate is valid for.">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Allowed users"
          value={draft.allowedUsers}
          onChange={(event) => onChange({ allowedUsers: event.target.value })}
          hint="Comma-separated; * allows any user name."
          spellCheck={false}
          monospace
        />
        <Input
          label="Default user"
          value={draft.defaultUser}
          onChange={(event) => onChange({ defaultUser: event.target.value })}
          hint="Used when a request names no principals."
          spellCheck={false}
          monospace
        />
      </div>
      <Checkbox
        label="Let requests set the key ID"
        description="Otherwise Vault sets it from the key ID format or the token."
        checked={draft.allowUserKeyIds}
        onChange={(allowUserKeyIds) => onChange({ allowUserKeyIds })}
      />
      <Input
        label="Key ID format"
        value={draft.keyIdFormat}
        onChange={(event) => onChange({ keyIdFormat: event.target.value })}
        placeholder="vault-{{token_display_name}}-{{public_key_hash}}"
        hint="Shows up in sshd logs. Supports {{role_name}}, {{token_display_name}}, and {{public_key_hash}}."
        spellCheck={false}
        monospace
      />
    </Group>
  );
}

function HostFields({ draft, onChange }: FieldsProps) {
  return (
    <Group title="Hosts" description="Host certificates prove a server's identity to clients.">
      <Input
        label="Allowed domains"
        value={draft.allowedDomains}
        onChange={(event) => onChange({ allowedDomains: event.target.value })}
        hint="Comma-separated, for example example.com,internal."
        spellCheck={false}
        monospace
      />
      <div className="grid gap-x-3 sm:grid-cols-2">
        <Checkbox label="Allow subdomains" description="web1.example.com for example.com" checked={draft.allowSubdomains} onChange={(allowSubdomains) => onChange({ allowSubdomains })} />
        <Checkbox label="Allow bare domains" description="example.com itself" checked={draft.allowBareDomains} onChange={(allowBareDomains) => onChange({ allowBareDomains })} />
      </div>
    </Group>
  );
}

/** Settings for roles that sign certificates (`key_type: ca`). */
export default function SshCaRoleFields(props: FieldsProps) {
  const { draft, errors, onChange } = props;
  return (
    <div className="space-y-4">
      <Group title="Certificate kinds">
        <div className="grid gap-x-3 sm:grid-cols-2">
          <Checkbox label="User certificates" description="People logging in to servers" checked={draft.allowUserCertificates} onChange={(allowUserCertificates) => onChange({ allowUserCertificates })} />
          <Checkbox label="Host certificates" description="Servers proving who they are" checked={draft.allowHostCertificates} onChange={(allowHostCertificates) => onChange({ allowHostCertificates })} />
        </div>
        {errors.certificates && <p role="alert" className="text-xs text-danger-600">{errors.certificates}</p>}
      </Group>
      {draft.allowUserCertificates && <UserFields {...props} />}
      {draft.allowHostCertificates && <HostFields {...props} />}
      {draft.allowUserCertificates && (
        <Group title="Extensions" description="What a user may do once logged in. Defaults apply when a request does not choose.">
          <ExtensionsTable {...props} />
        </Group>
      )}
      <Group title="Critical options" description="Restrictions sshd enforces, such as source-address or force-command.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Allowed critical options"
            value={draft.allowedCriticalOptions}
            onChange={(event) => onChange({ allowedCriticalOptions: event.target.value })}
            hint="Comma-separated names requests may set."
            spellCheck={false}
            monospace
          />
          <Textarea
            label="Default critical options"
            value={draft.defaultCriticalOptions}
            onChange={(event) => onChange({ defaultCriticalOptions: event.target.value })}
            rows={2}
            placeholder="source-address=10.0.0.0/8"
            error={errors.defaultCriticalOptions}
            spellCheck={false}
            monospace
          />
        </div>
      </Group>
      <Group title="Lifetime" description="Leave empty to use the engine's lease settings.">
        <div className="grid gap-3 sm:grid-cols-3">
          <Input label="TTL" value={draft.ttl} onChange={(event) => onChange({ ttl: event.target.value })} placeholder="30m" error={errors.ttl ?? durationError(draft.ttl)} monospace />
          <Input label="Max TTL" value={draft.maxTtl} onChange={(event) => onChange({ maxTtl: event.target.value })} placeholder="24h" error={errors.maxTtl ?? durationError(draft.maxTtl)} monospace />
          <Input
            label="Backdate validity by"
            value={draft.notBeforeDuration}
            onChange={(event) => onChange({ notBeforeDuration: event.target.value })}
            placeholder="30s"
            hint="Absorbs clock drift between Vault and hosts."
            error={errors.notBeforeDuration ?? durationError(draft.notBeforeDuration)}
            monospace
          />
        </div>
      </Group>
      <Group title="Signing">
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="Signature algorithm"
            value={draft.algorithmSigner}
            onChange={(event) => onChange({ algorithmSigner: event.target.value })}
            hint="Only applies to RSA CA keys. ssh-rsa (SHA-1) is rejected by OpenSSH 8.8 and later."
          >
            {SSH_ALGORITHM_SIGNERS.map((value) => <option key={value} value={value}>{value === 'default' ? 'Default' : value}</option>)}
          </Select>
          <Textarea
            label="Allowed user key lengths"
            value={draft.allowedUserKeyLengths}
            onChange={(event) => onChange({ allowedUserKeyLengths: event.target.value })}
            rows={2}
            placeholder={'rsa=3072,4096\ned25519=0'}
            error={errors.allowedUserKeyLengths}
            spellCheck={false}
            monospace
          />
        </div>
      </Group>
    </div>
  );
}
