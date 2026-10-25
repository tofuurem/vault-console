import { useMemo, useState, type FormEvent } from 'react';

import { useSignSshKey, useSshRole, useSshRoles } from '@/application/engines/ssh/useSsh';
import Button from '@/components/base/Button';
import ContentSkeleton from '@/components/base/ContentSkeleton';
import { Input, Textarea } from '@/components/base/Input';
import { durationError } from '@/domain/engines/engines';
import type { SshCaRole, SshCertType, SshRole, SshSignedKey } from '@/domain/engines/ssh/ssh';
import { parseOptionLines, parseSshPublicKey, splitList, SSH_STANDARD_EXTENSIONS } from '@/domain/engines/ssh/ssh-keys';
import { formatRoleTtl } from '@/domain/engines/ssh/ssh-roles';
import SshCertificateView from './SshCertificateView';
import { Checkbox, EmptyState, ErrorNotice, Notice, Panel, Segmented, Select } from './ssh-ui';

interface SshSignPanelProps {
  readonly mount: string;
  readonly role?: string;
  readonly caConfigured?: boolean;
  readonly onRoleChange: (role: string | undefined) => void;
  readonly onOpenCa: () => void;
  readonly onOpenRoles: () => void;
}

type ExtensionMode = 'defaults' | 'custom';

function extensionChoices(role: SshCaRole | undefined): readonly string[] {
  const allowed = splitList(role?.allowedExtensions ?? '');
  const standard = SSH_STANDARD_EXTENSIONS.map((extension) => extension.name);
  if (!role || allowed.includes('*') || allowed.length === 0) return standard;
  return allowed;
}

function caRole(role: SshRole | undefined): SshCaRole | undefined {
  return role?.keyType === 'ca' ? role : undefined;
}

/** Placeholders and locks that reflect the selected role, when it could be read. */
function roleHints(role: SshCaRole | undefined, certType: SshCertType) {
  return {
    userDisabled: role ? !role.allowUserCertificates : false,
    hostDisabled: role ? !role.allowHostCertificates : false,
    keyIdLocked: role ? !role.allowUserKeyIds : false,
    principalsPlaceholder: certType === 'user' ? role?.defaultUser || 'ubuntu,deploy' : 'web1.example.com',
    ttlPlaceholder: role ? formatRoleTtl(role.ttlSeconds) : '30m',
    ttlHint: role ? `Up to ${formatRoleTtl(role.maxTtlSeconds)} for this role.` : 'Empty uses the role TTL.',
  };
}

function KeyDetected({ result }: { readonly result: ReturnType<typeof parseSshPublicKey> }) {
  return (
    <p className="text-[11px] leading-4 text-foreground-500">
      {result.ok
        ? <>Detected <span className="font-mono">{result.key.type}</span>{result.key.comment ? <> · <span className="font-mono">{result.key.comment}</span></> : null}</>
        : <>Paste the contents of <span className="font-mono">~/.ssh/id_ed25519.pub</span> or another .pub file.</>}
    </p>
  );
}

function certTypeFor(role: SshCaRole | undefined, current: SshCertType): SshCertType {
  if (!role) return current;
  if (current === 'user' && !role.allowUserCertificates && role.allowHostCertificates) return 'host';
  if (current === 'host' && !role.allowHostCertificates && role.allowUserCertificates) return 'user';
  return current;
}

function ExtensionPicker({ role, mode, selected, onModeChange, onSelectedChange }: {
  readonly role: SshCaRole | undefined;
  readonly mode: ExtensionMode;
  readonly selected: readonly string[];
  readonly onModeChange: (mode: ExtensionMode) => void;
  readonly onSelectedChange: (selected: readonly string[]) => void;
}) {
  return (
    <div className="space-y-2">
      <Segmented<ExtensionMode>
        label="Extensions"
        value={mode}
        onChange={onModeChange}
        options={[{ value: 'defaults', label: 'Role defaults' }, { value: 'custom', label: 'Choose' }]}
      />
      {mode === 'defaults' ? (
        <p className="text-[11px] leading-4 text-foreground-500">
          {role
            ? `Vault adds: ${Object.keys(role.defaultExtensions).join(', ') || 'none'}.`
            : 'Vault adds the default extensions configured on the role.'}
        </p>
      ) : (
        <fieldset className="grid gap-x-3 sm:grid-cols-2">
          <legend className="sr-only">Extensions to request</legend>
          {extensionChoices(role).map((name) => (
            <Checkbox
              key={name}
              label={name}
              checked={selected.includes(name)}
              onChange={(on) => onSelectedChange(on ? [...selected, name] : selected.filter((item) => item !== name))}
            />
          ))}
          <p className="text-[11px] leading-4 text-foreground-500 sm:col-span-2">If nothing is checked, Vault falls back to the role defaults.</p>
        </fieldset>
      )}
    </div>
  );
}

interface SignResult {
  readonly role: string;
  readonly signed: SshSignedKey;
  readonly publicKeyType: string;
}

function SignForm({ mount, role, roleNames, onRoleChange }: {
  readonly mount: string;
  readonly role: string;
  readonly roleNames: readonly string[];
  readonly onRoleChange: (role: string) => void;
}) {
  const roleQuery = useSshRole(mount, role);
  const roleData = caRole(roleQuery.data);
  const mutation = useSignSshKey(mount);
  const [publicKey, setPublicKey] = useState('');
  const [requestedCertType, setCertType] = useState<SshCertType>('user');
  const [principals, setPrincipals] = useState('');
  const [ttl, setTtl] = useState('');
  const [keyId, setKeyId] = useState('');
  const [extensionMode, setExtensionMode] = useState<ExtensionMode>('defaults');
  const [extensions, setExtensions] = useState<readonly string[]>([]);
  const [criticalOptions, setCriticalOptions] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [result, setResult] = useState<SignResult>();

  const certType = certTypeFor(roleData, requestedCertType);
  const parsedKey = useMemo(() => parseSshPublicKey(publicKey), [publicKey]);
  const keyError = parsedKey.ok ? undefined : parsedKey.message;
  const ttlError = durationError(ttl);
  const critical = parseOptionLines(criticalOptions);
  const hints = roleHints(roleData, certType);
  const keyIdLocked = hints.keyIdLocked;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setShowErrors(true);
    if (!parsedKey.ok || ttlError || !critical.ok) return;
    mutation.mutate({
      role,
      publicKey,
      validPrincipals: splitList(principals).join(','),
      certType,
      ttl,
      keyId: keyIdLocked ? '' : keyId,
      ...(certType === 'user' && extensionMode === 'custom' ? { extensions: Object.fromEntries(extensions.map((name) => [name, ''])) } : {}),
      criticalOptions: critical.value,
    }, {
      onSuccess: (signed) => setResult({ role, signed, publicKeyType: parsedKey.key.type }),
    });
  };

  const changeExtensionMode = (mode: ExtensionMode) => {
    setExtensionMode(mode);
    if (mode === 'custom') setExtensions(Object.keys(roleData?.defaultExtensions ?? {}));
  };

  return (
    <div className="space-y-4">
      <Panel labelledBy="ssh-sign-title" title="Sign a public key" description="Vault returns a short-lived certificate for the key. The private key never leaves your machine.">
        <form onSubmit={submit} className="space-y-4" aria-label="Sign a public key" noValidate>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Role" value={role} onChange={(event) => onRoleChange(event.target.value)}>
              {roleNames.map((name) => <option key={name} value={name}>{name}</option>)}
            </Select>
            <Segmented<SshCertType>
              label="Certificate type"
              value={certType}
              onChange={setCertType}
              options={[
                { value: 'user', label: 'User', disabled: hints.userDisabled },
                { value: 'host', label: 'Host', disabled: hints.hostDisabled },
              ]}
            />
          </div>
          {roleQuery.isError && (
            <Notice tone="warning">The role settings could not be read, so defaults are not shown. Vault still applies them.</Notice>
          )}
          <div className="space-y-1">
            <Textarea
              label="Public key"
              value={publicKey}
              onChange={(event) => {
                setPublicKey(event.target.value);
                mutation.reset();
              }}
              rows={3}
              spellCheck={false}
              autoComplete="off"
              placeholder="ssh-ed25519 AAAAC3Nza… you@laptop"
              error={showErrors || publicKey.trim() ? keyError : undefined}
              monospace
            />
            <KeyDetected result={parsedKey} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              label={certType === 'user' ? 'Principals (login names)' : 'Principals (host names)'}
              value={principals}
              onChange={(event) => setPrincipals(event.target.value)}
              placeholder={hints.principalsPlaceholder}
              hint="Comma-separated. Empty uses the role default."
              spellCheck={false}
              monospace
            />
            <Input
              label="TTL"
              value={ttl}
              onChange={(event) => setTtl(event.target.value)}
              placeholder={hints.ttlPlaceholder}
              hint={hints.ttlHint}
              error={ttlError}
              monospace
            />
            <Input
              label="Key ID"
              value={keyIdLocked ? '' : keyId}
              onChange={(event) => setKeyId(event.target.value)}
              disabled={keyIdLocked}
              placeholder={keyIdLocked ? 'Set by the role' : 'alice@laptop'}
              hint={keyIdLocked ? 'This role does not let requests set the key ID.' : 'Shows up in sshd logs.'}
              spellCheck={false}
              monospace
            />
          </div>
          {certType === 'user' && (
            <ExtensionPicker
              role={roleData}
              mode={extensionMode}
              selected={extensions}
              onModeChange={changeExtensionMode}
              onSelectedChange={setExtensions}
            />
          )}
          <details className="group rounded-md border border-background-300">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 px-3 text-xs font-medium text-foreground-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400 sm:min-h-9">
              <i className="ri-arrow-right-s-line transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
              Critical options
              <span className="font-normal text-foreground-500">· optional</span>
            </summary>
            <div className="border-t border-background-200 p-3">
              <Textarea
                label="Critical options"
                value={criticalOptions}
                onChange={(event) => setCriticalOptions(event.target.value)}
                rows={2}
                placeholder="source-address=10.0.0.0/8"
                error={critical.ok ? undefined : critical.message}
                spellCheck={false}
                monospace
              />
            </div>
          </details>
          {mutation.isError && (
            <ErrorNotice
              title="The key was not signed"
              error={mutation.error}
              permissionHint={`Your token needs update on ${mount}/sign/${role}.`}
              requestHint="Check that the role allows these principals, extensions, TTL, and key type."
            />
          )}
          <div className="flex justify-end">
            <Button type="submit" size="sm" variant="primary" loading={mutation.isPending}>
              <i className="ri-quill-pen-line" aria-hidden="true" />
              Sign public key
            </Button>
          </div>
        </form>
      </Panel>
      {result && result.role === role && (
        <SshCertificateView signed={result.signed} publicKeyType={result.publicKeyType} onClear={() => setResult(undefined)} />
      )}
    </div>
  );
}

/** Pick a certificate role and sign a pasted public key. */
export default function SshSignPanel({ mount, role, caConfigured, onRoleChange, onOpenCa, onOpenRoles }: SshSignPanelProps) {
  const roles = useSshRoles(mount);
  if (roles.isPending) return <ContentSkeleton variant="detail" label="Loading roles" />;
  if (roles.isError) {
    return <ErrorNotice title="Roles could not be listed" error={roles.error} permissionHint={`Your token needs list on ${mount}/roles.`} />;
  }
  const caRoles = roles.data.filter((entry) => entry.keyType === 'ca').map((entry) => entry.name);
  if (caConfigured === false) {
    return (
      <EmptyState icon="ri-key-2-line" title="Configure the signing CA first" action={<Button size="sm" variant="primary" onClick={onOpenCa}>Configure the CA</Button>}>
        Vault needs a CA key pair before it can sign public keys.
      </EmptyState>
    );
  }
  if (caRoles.length === 0) {
    return (
      <EmptyState icon="ri-file-shield-2-line" title="No certificate roles" action={<Button size="sm" variant="primary" onClick={onOpenRoles}>Create role</Button>}>
        Create a role with the signed certificates type to choose who can get a certificate and for how long.
      </EmptyState>
    );
  }
  const selected = role && caRoles.includes(role) ? role : caRoles[0];
  return (
    <div className="space-y-3">
      {role && !caRoles.includes(role) && (
        <Notice tone="warning">There is no certificate role named <span className="font-mono">{role}</span>. Showing {selected} instead.</Notice>
      )}
      <SignForm mount={mount} role={selected} roleNames={caRoles} onRoleChange={onRoleChange} />
    </div>
  );
}
