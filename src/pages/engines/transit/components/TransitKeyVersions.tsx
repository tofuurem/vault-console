import { useState } from 'react';

import { useTrimTransitKey } from '@/application/engines/transit/useTransitKeys';
import { useToast } from '@/application/notifications/ToastContext';
import Button from '@/components/base/Button';
import { useConfirmDialog } from '@/components/base/useConfirmDialog';
import type { TransitKey, TransitKeyVersion } from '@/domain/engines/transit/transit';
import { transitKeyTypeInfo } from '@/domain/engines/transit/transit-key-types';
import { keyVersionState, maxTrimVersion, type VersionState } from '@/domain/engines/transit/transit-validation';
import { useCopyToClipboard } from './useCopyToClipboard';
import { OperationError, SelectField } from './fields';

const VISIBLE_VERSIONS = 25;

function stateLabel(state: VersionState, signing: boolean): { readonly label: string; readonly tone: string } {
  if (state === 'active') return { label: 'Active', tone: 'bg-success-100 text-success-700' };
  if (state === 'decrypt-only') return { label: signing ? 'Verify only' : 'Decrypt only', tone: 'bg-warning-100 text-warning-700' };
  if (state === 'archived') return { label: 'Archived', tone: 'bg-background-200 text-foreground-600' };
  return { label: 'Trimmed', tone: 'bg-danger-100 text-danger-700' };
}

function formatCreated(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

function PublicKey({ version, value }: { readonly version: number; readonly value: string }) {
  const { copied, copy } = useCopyToClipboard();
  return (
    <details className="group mt-2 rounded-md border border-background-200 bg-background-100/60">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 px-2.5 text-xs font-medium text-foreground-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400 sm:min-h-8">
        <i className="ri-arrow-right-s-line transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
        Public key
      </summary>
      <div className="space-y-2 border-t border-background-200 p-2.5">
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-4 text-foreground-800">{value}</pre>
        <Button type="button" size="sm" onClick={() => void copy('public', value)} aria-label={`Copy public key for version ${version}`}>
          <i className={copied ? 'ri-check-line text-success-600' : 'ri-file-copy-line'} aria-hidden="true" />
          {copied ? 'Copied' : 'Copy public key'}
        </Button>
      </div>
    </details>
  );
}

function VersionRow({ transitKey, version, details }: {
  readonly transitKey: TransitKey;
  readonly version: number;
  readonly details?: TransitKeyVersion;
}) {
  const signing = transitKey.supportsSigning && !transitKey.supportsEncryption;
  const state = stateLabel(keyVersionState(transitKey, version), signing);
  const created = formatCreated(details?.createdAt);
  const markers = [
    version === transitKey.latestVersion ? 'Latest' : undefined,
    version === transitKey.minDecryptionVersion ? `Oldest that can ${signing ? 'verify' : 'decrypt'}` : undefined,
    version === transitKey.minEncryptionVersion ? `Oldest that can ${signing ? 'sign' : 'encrypt'}` : undefined,
  ].filter((marker): marker is string => Boolean(marker));
  return (
    <li className="relative pb-3 pl-6 last:pb-0">
      <span aria-hidden="true" className="absolute left-[7px] top-4 h-full w-px bg-background-300" />
      <span
        aria-hidden="true"
        className={`absolute left-0.5 top-1.5 h-3 w-3 rounded-full border-2 ${
          version === transitKey.latestVersion ? 'border-primary-500 bg-primary-100' : 'border-background-400 bg-background-50'
        }`}
      />
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-mono text-xs font-semibold tabular-nums text-foreground-900">v{version}</span>
        <span className={`rounded-md px-1.5 text-[11px] font-medium ${state.tone}`}>{state.label}</span>
        {markers.map((marker) => (
          <span key={marker} className="rounded-md border border-primary-200 bg-primary-50 px-1.5 text-[11px] font-medium text-primary-700">{marker}</span>
        ))}
      </div>
      <p className="mt-0.5 text-[11px] tabular-nums text-foreground-500">
        {created ? `Created ${created}` : 'Creation time not available'}
      </p>
      {details?.publicKey && <PublicKey version={version} value={details.publicKey} />}
    </li>
  );
}

function TrimSection({ mount, transitKey, onOpenSettings }: {
  readonly mount: string;
  readonly transitKey: TransitKey;
  readonly onOpenSettings: () => void;
}) {
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirmDialog();
  const trim = useTrimTransitKey(mount, transitKey.name);
  const max = maxTrimVersion(transitKey);
  const min = Math.max(1, transitKey.minAvailableVersion);
  const [target, setTarget] = useState(String(max ?? min));
  // Keeping `min` as the oldest would delete nothing, so offer only versions above it.
  const choices = max === undefined || max <= min ? [] : Array.from({ length: max - min }, (_, index) => max - index);
  const canTrim = max !== undefined && max > min;

  const submit = async () => {
    const version = Number(target);
    const confirmed = await confirm({
      title: `Trim ${transitKey.name}`,
      message: `Permanently delete key versions older than v${version}. Anything still encrypted or signed with those versions can never be decrypted or verified again. This cannot be undone.`,
      confirmLabel: 'Trim versions',
    });
    if (!confirmed) return;
    trim.mutate(version, { onSuccess: () => toast.success(`Trimmed versions older than v${version}.`) });
  };

  return (
    <section aria-labelledby="transit-trim-title" className="space-y-2 rounded-lg border border-danger-200 bg-danger-50/40 p-3">
      <h4 id="transit-trim-title" className="text-xs font-semibold text-danger-700">Trim old versions</h4>
      <p className="text-xs leading-5 text-foreground-600">
        Archived versions stay in storage so you can lower the minimum versions again. Trimming deletes them for good.
      </p>
      {max === undefined ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs leading-5 text-foreground-600">Set both minimum versions explicitly before trimming.</p>
          <Button type="button" size="sm" onClick={onOpenSettings}>Open settings</Button>
        </div>
      ) : canTrim ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-40">
            <SelectField
              label="Keep versions from"
              value={target}
              onChange={setTarget}
              options={choices.map((version) => [String(version), `v${version}`] as const)}
            />
          </div>
          <Button type="button" size="sm" variant="danger" loading={trim.isPending} onClick={() => void submit()}>
            Trim versions
          </Button>
        </div>
      ) : (
        <p className="text-xs leading-5 text-foreground-600">
          Nothing to trim. Raise the minimum versions in Settings first to archive older versions.
        </p>
      )}
      <OperationError error={trim.error} action="trim this key" />
      {confirmDialog}
    </section>
  );
}

/** Version timeline with the decryption and encryption floors marked. */
export default function TransitKeyVersions({ mount, transitKey, onOpenSettings }: {
  readonly mount: string;
  readonly transitKey: TransitKey;
  readonly onOpenSettings: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const byVersion = new Map(transitKey.versions.map((entry) => [entry.version, entry]));
  const all = Array.from({ length: transitKey.latestVersion }, (_, index) => transitKey.latestVersion - index);
  const visible = showAll ? all : all.slice(0, VISIBLE_VERSIONS);
  const asymmetric = transitKeyTypeInfo(transitKey.type)?.asymmetric ?? transitKey.versions.some((entry) => entry.publicKey);
  return (
    <div className="space-y-4">
      <section aria-labelledby="transit-versions-title" className="rounded-lg border border-background-300 bg-background-50 p-3 sm:p-4">
        <h3 id="transit-versions-title" className="text-sm font-semibold text-foreground-900">Versions</h3>
        <p className="mb-3 mt-0.5 text-xs leading-5 text-foreground-600">
          Rotating adds a version. New data uses the latest version; older versions keep working until you raise the minimum versions.
          {asymmetric && ' Each version has its own public key.'}
        </p>
        <ol aria-label="Key versions" className="[&>li:last-child>span:first-child]:hidden">
          {visible.map((version) => (
            <VersionRow key={version} transitKey={transitKey} version={version} details={byVersion.get(version)} />
          ))}
        </ol>
        {all.length > visible.length && (
          <Button type="button" size="sm" variant="ghost" className="mt-2" onClick={() => setShowAll(true)}>
            Show all {all.length} versions
          </Button>
        )}
      </section>
      <TrimSection key={`${transitKey.minDecryptionVersion}:${transitKey.minEncryptionVersion}:${transitKey.minAvailableVersion}`} mount={mount} transitKey={transitKey} onOpenSettings={onOpenSettings} />
    </div>
  );
}
