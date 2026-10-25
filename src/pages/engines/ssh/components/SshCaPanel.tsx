import { useMemo, useState, type FormEvent } from 'react';

import { useDeleteSshCa, useSshCa } from '@/application/engines/ssh/useSsh';
import { useToast } from '@/application/notifications/ToastContext';
import Badge from '@/components/base/Badge';
import Button from '@/components/base/Button';
import ContentSkeleton from '@/components/base/ContentSkeleton';
import { Input } from '@/components/base/Input';
import { parseSshPublicKey, sshTrustSnippets } from '@/domain/engines/ssh/ssh-keys';
import SshCaSetupForm from './SshCaSetupForm';
import { CodeBlock, EmptyState, ErrorNotice, Notice, Panel } from './ssh-ui';
import { downloadText, useCopy } from './useCopy';
import { useFingerprint } from './useFingerprint';

interface SshCaPanelProps {
  readonly mount: string;
  readonly serverUrl: string;
  /** Undefined while roles are loading or unreadable. */
  readonly roleCount?: number;
  readonly onCreateRole: () => void;
}

function DeleteCaSection({ mount }: { readonly mount: string }) {
  const toast = useToast();
  const mutation = useDeleteSshCa(mount);
  const [typed, setTyped] = useState('');
  const confirmed = typed.trim() === mount;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!confirmed) return;
    mutation.mutate(undefined, {
      onSuccess: () => {
        setTyped('');
        toast.success('The signing CA was deleted.');
      },
    });
  };
  return (
    <section aria-labelledby="ssh-ca-delete-title" className="space-y-3 rounded-lg border border-danger-200 bg-danger-50/50 p-3 sm:p-4">
      <div>
        <h3 id="ssh-ca-delete-title" className="text-xs font-semibold text-danger-700">Delete signing CA</h3>
        <p className="mt-1 text-xs leading-5 text-foreground-600">
          Hosts and clients that trust this CA will reject every certificate it signed, including ones that have not
          expired yet. A new CA has a different key, so you will need to distribute it to every host again. Roles are kept.
        </p>
      </div>
      <form className="space-y-3" onSubmit={submit}>
        <Input
          label={`Type ${mount} to confirm`}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          monospace
        />
        {mutation.isError && (
          <ErrorNotice title="The CA was not deleted" error={mutation.error} permissionHint={`Your token needs delete on ${mount}/config/ca.`} />
        )}
        <Button type="submit" size="sm" variant="danger" disabled={!confirmed} loading={mutation.isPending}>
          Delete signing CA
        </Button>
      </form>
    </section>
  );
}

function TrustSnippets({ publicKey, mount, serverUrl }: { readonly publicKey: string; readonly mount: string; readonly serverUrl: string }) {
  const copy = useCopy();
  const [domain, setDomain] = useState('*.example.com');
  const snippets = sshTrustSnippets(publicKey, mount, serverUrl, domain.trim() || '*');
  return (
    <Panel
      labelledBy="ssh-ca-trust-title"
      title="Trust this CA"
      description="Paste these on your machines. The CA public key is not secret."
    >
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-foreground-800">Servers that accept user certificates</h3>
        <p className="text-xs leading-5 text-foreground-600">
          Download the key on each host, add one line to <span className="font-mono">/etc/ssh/sshd_config</span>, then reload sshd.
          Hosts can fetch the key without a Vault token from{' '}
          <a href={snippets.publicKeyUrl} target="_blank" rel="noreferrer noopener" className="break-all font-mono text-primary-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400">
            {snippets.publicKeyUrl}
          </a>.
        </p>
        <CodeBlock id="sshd-install" label="Download the CA key" value={snippets.sshdInstall} copy={copy} />
        <CodeBlock id="sshd-config" label="sshd_config" value={snippets.sshdConfig} copy={copy} />
      </div>
      <div className="space-y-2 border-t border-background-200 pt-3">
        <h3 className="text-xs font-semibold text-foreground-800">Clients that verify host certificates</h3>
        <p className="text-xs leading-5 text-foreground-600">
          Add this line to <span className="font-mono">~/.ssh/known_hosts</span> (or <span className="font-mono">/etc/ssh/ssh_known_hosts</span>)
          so clients trust hosts signed by this CA without a fingerprint prompt.
        </p>
        <div className="max-w-xs">
          <Input label="Host pattern" value={domain} onChange={(event) => setDomain(event.target.value)} spellCheck={false} monospace />
        </div>
        <CodeBlock id="known-hosts" label="known_hosts" value={snippets.knownHosts} copy={copy} />
      </div>
    </Panel>
  );
}

function ConfiguredCa({ publicKey, mount, serverUrl }: { readonly publicKey: string; readonly mount: string; readonly serverUrl: string }) {
  const copy = useCopy();
  const parsed = useMemo(() => parseSshPublicKey(publicKey), [publicKey]);
  const fingerprint = useFingerprint(parsed.ok ? parsed.key.blob : undefined);
  return (
    <>
      <Panel
        labelledBy="ssh-ca-title"
        title="Signing CA"
        description="Vault signs SSH certificates with this key pair. Only the public half is shown."
        actions={<Badge variant="success">Configured</Badge>}
      >
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
          <dt className="text-foreground-500">Key type</dt>
          <dd className="font-mono text-foreground-800">{parsed.ok ? parsed.key.type : publicKey.split(' ')[0]}</dd>
          <dt className="text-foreground-500">Fingerprint</dt>
          <dd className="break-all font-mono text-foreground-800">{fingerprint ?? '…'}</dd>
        </dl>
        <CodeBlock
          id="ca-public-key"
          label="CA public key"
          value={publicKey}
          copy={copy}
          actions={(
            <Button size="sm" variant="ghost" onClick={() => downloadText('trusted-user-ca-keys.pem', publicKey)} aria-label="Download CA public key">
              <i className="ri-download-2-line" aria-hidden="true" />
              <span className="hidden sm:inline">Download</span>
            </Button>
          )}
        />
      </Panel>
      <TrustSnippets publicKey={publicKey} mount={mount} serverUrl={serverUrl} />
      <DeleteCaSection mount={mount} />
    </>
  );
}

/** CA status: setup when empty, otherwise the public key, host snippets, and deletion. */
export default function SshCaPanel({ mount, serverUrl, roleCount, onCreateRole }: SshCaPanelProps) {
  const ca = useSshCa(mount);
  if (ca.isPending) return <ContentSkeleton variant="detail" label="Loading signing CA" />;
  if (ca.isError) {
    return (
      <ErrorNotice
        title="The signing CA could not be read"
        error={ca.error}
        permissionHint={`Your token needs read on ${mount}/config/ca.`}
      />
    );
  }
  if (!ca.data) {
    return (
      <div className="space-y-4">
        <EmptyState icon="ri-key-2-line" title="No signing CA yet">
          Configure a CA first, then create a role. Certificates signed by this CA let people and hosts connect
          without copying keys into <span className="font-mono">authorized_keys</span>. One-time password roles work without a CA.
        </EmptyState>
        <Panel labelledBy="ssh-ca-setup-title" title="Configure signing CA">
          <SshCaSetupForm mount={mount} />
        </Panel>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {roleCount === 0 && (
        <Notice title="Next: create a role">
          <p>Roles decide who can get a certificate, for which users or hosts, and for how long.</p>
          <Button size="sm" className="mt-2" onClick={onCreateRole}>
            <i className="ri-add-line" aria-hidden="true" />
            Create role
          </Button>
        </Notice>
      )}
      <ConfiguredCa publicKey={ca.data.publicKey} mount={mount} serverUrl={serverUrl} />
    </div>
  );
}
