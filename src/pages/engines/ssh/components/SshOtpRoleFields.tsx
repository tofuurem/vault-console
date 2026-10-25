import { Input } from '@/components/base/Input';
import type { OtpRoleDraft, RoleDraftErrors } from '../role-draft';
import { Notice } from './ssh-ui';

interface SshOtpRoleFieldsProps {
  readonly draft: OtpRoleDraft;
  readonly errors: RoleDraftErrors;
  readonly onChange: (patch: Partial<OtpRoleDraft>) => void;
}

/** Settings for roles that issue one-time passwords (`key_type: otp`). */
export default function SshOtpRoleFields({ draft, errors, onChange }: SshOtpRoleFieldsProps) {
  return (
    <div className="space-y-3">
      <Notice>
        Each target host runs <span className="font-mono">vault-ssh-helper</span>, which asks Vault to check the password at login.
        Vault only issues passwords for IP addresses inside the CIDR list.
      </Notice>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Default user"
          value={draft.defaultUser}
          onChange={(event) => onChange({ defaultUser: event.target.value })}
          error={errors.defaultUser}
          spellCheck={false}
          monospace
        />
        <Input
          label="Allowed users"
          value={draft.allowedUsers}
          onChange={(event) => onChange({ allowedUsers: event.target.value })}
          hint="Comma-separated; * allows any user. Empty allows only the default user."
          spellCheck={false}
          monospace
        />
        <Input
          label="CIDR list"
          value={draft.cidrList}
          onChange={(event) => onChange({ cidrList: event.target.value })}
          placeholder="10.0.0.0/8,192.168.0.0/16"
          error={errors.cidrList}
          spellCheck={false}
          monospace
        />
        <Input
          label="Excluded CIDR list"
          value={draft.excludeCidrList}
          onChange={(event) => onChange({ excludeCidrList: event.target.value })}
          placeholder="10.0.5.0/24"
          spellCheck={false}
          monospace
        />
        <Input
          label="SSH port"
          value={draft.port}
          onChange={(event) => onChange({ port: event.target.value })}
          inputMode="numeric"
          error={errors.port}
          className="tabular-nums"
        />
      </div>
    </div>
  );
}
