import { useEffect, useRef, useState, type FormEvent } from 'react';

import { useCreateSshOtp, useSshRoles, useVerifySshOtp } from '@/application/engines/ssh/useSsh';
import Button from '@/components/base/Button';
import ContentSkeleton from '@/components/base/ContentSkeleton';
import { Input } from '@/components/base/Input';
import { formatTtlSeconds } from '@/domain/engines/engines';
import { sshOtp, type SshOtpCredential, type SshOtpVerification } from '@/domain/engines/ssh/ssh';
import { ipAddressError } from '@/domain/engines/ssh/ssh-keys';
import SshZeroAddressSection from './SshZeroAddressSection';
import { CodeBlock, CopyButton, EmptyState, ErrorNotice, Notice, Panel, Select } from './ssh-ui';
import { useCopy } from './useCopy';

interface SshOtpPanelProps {
  readonly mount: string;
  readonly role?: string;
  readonly onRoleChange: (role: string | undefined) => void;
  readonly onOpenRoles: () => void;
}

const HIDE_AFTER_MS = 30_000;

function OtpResult({ credential, onClear }: { readonly credential: SshOtpCredential; readonly onClear: () => void }) {
  const copy = useCopy();
  const [revealed, setRevealed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const toggle = () => {
    clearTimeout(timer.current);
    setRevealed((current) => {
      if (!current) timer.current = setTimeout(() => setRevealed(false), HIDE_AFTER_MS);
      return !current;
    });
  };
  const target = `${credential.username}@${credential.ip}`;
  const command = credential.port && credential.port !== 22 ? `ssh -p ${credential.port} ${target}` : `ssh ${target}`;
  return (
    <section aria-labelledby="ssh-otp-result-title" className="overflow-hidden rounded-lg border border-success-200 bg-background-50">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-success-200 bg-success-50 px-3 py-2 sm:px-4">
        <h2 id="ssh-otp-result-title" className="flex items-center gap-1.5 text-xs font-semibold text-success-800">
          <i className="ri-checkbox-circle-line" aria-hidden="true" />
          One-time password created
        </h2>
        <Button size="sm" variant="ghost" onClick={onClear}>
          <i className="ri-close-line" aria-hidden="true" />
          Clear
        </Button>
      </header>
      <div className="space-y-3 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-background-300 bg-background-100 px-3 py-2">
          <span aria-label="One-time password" className={`min-w-0 flex-1 break-all font-mono text-sm ${revealed ? 'text-foreground-900' : 'select-none tracking-widest text-foreground-400'}`}>
            {revealed ? credential.otp.reveal() : '•'.repeat(16)}
          </span>
          <div className="flex shrink-0 items-center gap-0.5">
            <Button size="sm" variant="ghost" onClick={toggle} aria-pressed={revealed}>
              <i className={revealed ? 'ri-eye-off-line' : 'ri-eye-line'} aria-hidden="true" />
              {revealed ? 'Hide' : 'Reveal'}
            </Button>
            <CopyButton id="otp" value={credential.otp.reveal()} label="one-time password" copy={copy} />
          </div>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
          <dt className="text-foreground-500">Login</dt>
          <dd className="break-all font-mono text-foreground-800">{target}{credential.port ? `:${credential.port}` : ''}</dd>
          {credential.leaseId && (
            <>
              <dt className="text-foreground-500">Lease</dt>
              <dd className="break-all font-mono text-foreground-800">{credential.leaseId}</dd>
              <dt className="text-foreground-500">Expires in</dt>
              <dd className="tabular-nums text-foreground-800">{formatTtlSeconds(credential.leaseDurationSeconds ?? 0)}</dd>
            </>
          )}
        </dl>
        <CodeBlock id="otp-command" label="Connect, then paste the password when asked" value={command} copy={copy} wrap={false} />
        <Notice>
          The password works for one login. The host must run <span className="font-mono">vault-ssh-helper</span> so sshd can check it with Vault.
          It is not saved anywhere; clear it or leave this page when you are done.
        </Notice>
      </div>
    </section>
  );
}

function CreateOtpForm({ mount, role, roleNames, onRoleChange }: {
  readonly mount: string;
  readonly role: string;
  readonly roleNames: readonly string[];
  readonly onRoleChange: (role: string) => void;
}) {
  const mutation = useCreateSshOtp(mount);
  const [ip, setIp] = useState('');
  const [username, setUsername] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [credential, setCredential] = useState<{ readonly role: string; readonly value: SshOtpCredential }>();
  const ipError = ipAddressError(ip);
  // The password belongs to one request: switching roles drops it.
  if (credential && credential.role !== role) setCredential(undefined);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setShowErrors(true);
    if (ipError) return;
    mutation.mutate({ role, request: { ip, username } }, {
      onSuccess: (value) => {
        setShowErrors(false);
        setCredential({ role, value });
      },
    });
  };

  return (
    <div className="space-y-4">
      <Panel labelledBy="ssh-otp-title" title="Create a one-time password" description="Vault issues a password for one SSH login to one host.">
        <form onSubmit={submit} className="space-y-3" aria-label="Create a one-time password" noValidate>
          <div className="grid gap-3 sm:grid-cols-3">
            <Select label="Role" value={role} onChange={(event) => onRoleChange(event.target.value)}>
              {roleNames.map((name) => <option key={name} value={name}>{name}</option>)}
            </Select>
            <Input
              label="Host IP address"
              value={ip}
              onChange={(event) => setIp(event.target.value)}
              placeholder="10.0.0.5"
              error={showErrors || ip.trim() ? ipError : undefined}
              inputMode="decimal"
              autoComplete="off"
              spellCheck={false}
              monospace
            />
            <Input
              label="User name"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Role default"
              autoComplete="off"
              spellCheck={false}
              monospace
            />
          </div>
          {mutation.isError && (
            <ErrorNotice
              title="No password was created"
              error={mutation.error}
              permissionHint={`Your token needs update on ${mount}/creds/${role}.`}
              requestHint="Check that the IP is inside the role's CIDR list and the user name is allowed."
            />
          )}
          <div className="flex justify-end">
            <Button type="submit" size="sm" variant="primary" loading={mutation.isPending}>
              <i className="ri-key-line" aria-hidden="true" />
              Create password
            </Button>
          </div>
        </form>
      </Panel>
      {credential && credential.role === role && <OtpResult credential={credential.value} onClear={() => setCredential(undefined)} />}
    </div>
  );
}

function VerifyOtpSection({ mount }: { readonly mount: string }) {
  const mutation = useVerifySshOtp(mount);
  const [otp, setOtp] = useState('');
  const [result, setResult] = useState<{ readonly value: SshOtpVerification | null }>();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!otp.trim()) return;
    mutation.mutate(sshOtp(otp.trim()), {
      onSuccess: (value) => {
        setOtp('');
        setResult({ value });
      },
    });
  };
  return (
    <Panel
      labelledBy="ssh-otp-verify-title"
      title="Check a one-time password"
      description="This is what vault-ssh-helper does at login. Checking a valid password uses it up."
    >
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-end" aria-label="Check a one-time password">
        <div className="min-w-0 flex-1">
          <Input
            label="Password to check"
            type="password"
            value={otp}
            onChange={(event) => {
              setOtp(event.target.value);
              setResult(undefined);
            }}
            autoComplete="off"
            spellCheck={false}
            monospace
          />
        </div>
        <Button type="submit" size="sm" loading={mutation.isPending} disabled={!otp.trim()}>Check password</Button>
      </form>
      {mutation.isError && (
        <ErrorNotice title="The password could not be checked" error={mutation.error} permissionHint={`Your token needs update on ${mount}/verify.`} />
      )}
      {result && (result.value ? (
        <Notice tone="success" title="Valid password">
          It was issued for <span className="font-mono">{result.value.username}@{result.value.ip}</span> by role{' '}
          <span className="font-mono">{result.value.roleName}</span>. Vault has now consumed it.
        </Notice>
      ) : (
        <Notice tone="warning" title="Unknown password">Vault does not know this password. It may have been used already or never issued.</Notice>
      ))}
    </Panel>
  );
}

/** OTP issue, verification, and the zero-address allow list. */
export default function SshOtpPanel({ mount, role, onRoleChange, onOpenRoles }: SshOtpPanelProps) {
  const roles = useSshRoles(mount);
  if (roles.isPending) return <ContentSkeleton variant="detail" label="Loading roles" />;
  if (roles.isError) {
    return <ErrorNotice title="Roles could not be listed" error={roles.error} permissionHint={`Your token needs list on ${mount}/roles.`} />;
  }
  const otpRoles = roles.data.filter((entry) => entry.keyType === 'otp').map((entry) => entry.name);
  if (otpRoles.length === 0) {
    return (
      <div className="space-y-4">
        <EmptyState icon="ri-key-line" title="No one-time password roles" action={<Button size="sm" variant="primary" onClick={onOpenRoles}>Create role</Button>}>
          Create a role with the one-time passwords type. Hosts verify these passwords with Vault through vault-ssh-helper, so no CA is needed.
        </EmptyState>
        <VerifyOtpSection mount={mount} />
      </div>
    );
  }
  const selected = role && otpRoles.includes(role) ? role : otpRoles[0];
  return (
    <div className="space-y-4">
      {role && !otpRoles.includes(role) && (
        <Notice tone="warning">There is no one-time password role named <span className="font-mono">{role}</span>. Showing {selected} instead.</Notice>
      )}
      <CreateOtpForm mount={mount} role={selected} roleNames={otpRoles} onRoleChange={onRoleChange} />
      <VerifyOtpSection mount={mount} />
      <SshZeroAddressSection mount={mount} otpRoles={otpRoles} />
    </div>
  );
}
