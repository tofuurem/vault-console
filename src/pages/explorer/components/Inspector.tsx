import { useEffect, useRef, useState } from 'react';

import type { VaultQueryState, KvSecretDetails } from '@/application/vault/useKvExplorerData';
import type { KvActionPermissions } from '@/application/vault/useKvActionPermissions';
import Badge from '@/components/base/Badge';
import Tabs from '@/components/base/Tabs';
import Tooltip from '@/components/base/Tooltip';
import { isSecretJsonObject, secretContainerSize, secretValueType } from '@/domain/vault/secret-json';

interface InspectorProps {
  readonly state: VaultQueryState<KvSecretDetails>;
  readonly mount: string;
  readonly path: string | null;
  readonly onRetry: () => void;
  readonly onOpenFullScreen?: () => void;
  readonly onEdit?: () => void;
  readonly permissions?: KvActionPermissions;
  readonly onCompare?: () => void;
  readonly onDeleteLatest?: (version: number) => void;
  readonly onDeleteVersion?: (version: number) => void;
  readonly onUndelete?: (version: number) => void;
  readonly onDestroyVersion?: (version: number) => void;
  readonly onDeleteMetadata?: (version: number) => void;
}

function printableValue(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2) ?? String(value);
}

function MaskedValue({ value }: { value: unknown }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const printable = printableValue(value);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const reveal = () => {
    setRevealed((current) => !current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setRevealed(false), 8_000);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(printable);
      setCopied(true);
      setTimeout(() => setCopied(false), 1_500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="group flex min-w-0 items-start gap-1.5">
      <span className={`min-w-0 flex-1 break-all font-mono text-xs ${revealed ? 'whitespace-pre-wrap text-foreground-800' : 'select-none text-foreground-400'}`}>
        {revealed ? printable : '•'.repeat(Math.min(Math.max(printable.length, 8), 24))}
      </span>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <Tooltip content={revealed ? 'Hide value' : 'Reveal for 8 seconds'}>
          <button type="button" aria-label={revealed ? 'Hide value' : 'Reveal value'} onClick={reveal} className="flex h-6 w-6 items-center justify-center rounded text-foreground-400 hover:bg-background-100 hover:text-foreground-700 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400">
            <i className={`${revealed ? 'ri-eye-off-line' : 'ri-eye-line'} text-xs`} aria-hidden="true" />
          </button>
        </Tooltip>
        <Tooltip content={copied ? 'Copied' : 'Copy value'}>
          <button type="button" aria-label="Copy value" onClick={() => void copy()} className="flex h-6 w-6 items-center justify-center rounded text-foreground-400 hover:bg-background-100 hover:text-foreground-700 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400">
            <i className={`${copied ? 'ri-check-line text-emerald-600' : 'ri-file-copy-line'} text-xs`} aria-hidden="true" />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

function InspectorValue({ value }: { value: unknown }) {
  if (Array.isArray(value) || isSecretJsonObject(value)) {
    const type = secretValueType(value);
    const size = secretContainerSize(value);
    return (
      <div className="flex min-w-0 items-center gap-1.5 text-xs text-foreground-500">
        <i className={type === 'array' ? 'ri-brackets-line' : 'ri-braces-line'} aria-hidden="true" />
        <span className="font-mono">{type}</span>
        <span className="text-foreground-300">·</span>
        <span>{size} {size === 1 ? 'item' : 'items'}</span>
      </div>
    );
  }
  return <MaskedValue value={value} />;
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function Inspector({
  state,
  mount,
  path,
  onRetry,
  onOpenFullScreen,
  onEdit,
  permissions,
  onCompare,
  onDeleteLatest,
  onDeleteVersion,
  onUndelete,
  onDestroyVersion,
  onDeleteMetadata,
}: InspectorProps) {
  const [activeTab, setActiveTab] = useState('data');

  if (!path || state.status === 'idle') {
    return (
      <div className="flex h-full flex-col items-center justify-center px-4 text-center">
        <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-background-200">
          <i className="ri-file-info-line text-lg text-foreground-400" aria-hidden="true" />
        </div>
        <p className="text-xs text-foreground-500">Select a secret to inspect</p>
      </div>
    );
  }
  if (state.status === 'loading') {
    return <div className="space-y-3 p-4" aria-label="Loading secret"><div className="h-4 w-32 animate-pulse rounded bg-background-200" /><div className="h-24 animate-pulse rounded bg-background-200" /></div>;
  }
  if (state.status === 'error') {
    return (
      <div role="alert" className="m-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        <p className="font-semibold">{state.error.code === 'authorization' ? 'Secret data is not allowed' : 'Secret could not be loaded'}</p>
        <p className="mt-1 leading-5">{state.error.message}</p>
        <button type="button" onClick={onRetry} className="mt-2 font-medium text-amber-900 underline underline-offset-2">Retry</button>
      </div>
    );
  }

  const { secret, history } = state.data;
  const tabs = [
    { key: 'data', label: 'Data', icon: 'ri-database-2-line' },
    { key: 'versions', label: 'Versions', icon: 'ri-history-line', count: history.versions.length },
    { key: 'metadata', label: 'Metadata', icon: 'ri-information-line' },
  ];

  return (
    <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab}>
      {activeTab === 'data' && (
        <div className="space-y-3 p-3">
          {!secret ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <p className="font-semibold">Current version has no readable data</p>
              <p className="mt-1 leading-5">It is deleted or destroyed. Open Versions to inspect its state.</p>
            </div>
          ) : (
            <>
          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="text-[11px] font-medium text-foreground-500">Current version</span>
              <span className="ml-1.5 font-mono text-xs text-foreground-800">v{secret.metadata.version}</span>
            </div>
            <div className="flex items-center gap-1">
              {onOpenFullScreen && <button type="button" aria-label="Open secret full screen" onClick={onOpenFullScreen} className="flex h-7 items-center gap-1 rounded-md border border-background-300 bg-background-50 px-2 text-[11px] font-medium text-foreground-600 hover:bg-background-100 hover:text-foreground-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"><i className="ri-fullscreen-line text-xs" aria-hidden="true" /> Full screen</button>}
              {onEdit && permissions?.canEdit && <button type="button" onClick={onEdit} className="h-7 rounded-md bg-primary-500 px-2 text-[11px] font-medium text-background-50 hover:bg-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400">Edit secret</button>}
            </div>
          </div>
          <p className="text-[10px] text-foreground-400">Created {formatTime(secret.metadata.createdTime)}</p>
          <div className="overflow-hidden rounded-md border border-background-200">
            <div className="grid grid-cols-[minmax(90px,120px)_1fr] border-b border-background-200 bg-background-100 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-foreground-500"><span>Key</span><span>Value</span></div>
            <div className="divide-y divide-background-100">
              {Object.entries(secret.data).map(([key, value]) => (
                <div key={key} className="grid grid-cols-[minmax(90px,120px)_1fr] px-2.5 py-2">
                  <span className="break-all pr-2 font-mono text-xs font-medium text-foreground-700">{key}</span>
                  <InspectorValue value={value} />
                </div>
              ))}
            </div>
          </div>
            </>
          )}
        </div>
      )}
      {activeTab === 'versions' && (
        <div className="space-y-1 p-3">
          {history.versions.map((version) => {
            const current = version.version === history.currentVersion;
            return (
              <div key={version.version} className={`flex items-center gap-3 rounded-md border px-2.5 py-2 ${current ? 'border-primary-200 bg-primary-50/30' : 'border-background-200'} ${version.destroyed ? 'opacity-55' : ''}`}>
                <span className="w-8 shrink-0 font-mono text-xs font-semibold text-foreground-800">v{version.version}</span>
                <div className="min-w-0 flex-1">
                  {current && !version.deletionTime && !version.destroyed && <Badge variant="success">Current</Badge>}
                  {version.deletionTime && <Badge variant="danger">Deleted</Badge>}
                  {version.destroyed && <Badge variant="danger">Destroyed</Badge>}
                  {!current && !version.deletionTime && !version.destroyed && <Badge variant="info">Older</Badge>}
                  <p className="mt-0.5 truncate text-[10px] text-foreground-400">{formatTime(version.createdTime)}</p>
                </div>
                {!version.destroyed && (
                  <div className="flex shrink-0 items-center gap-0.5">
                    {version.deletionTime && permissions?.canUndelete && <button type="button" aria-label={`Undelete version ${version.version}`} onClick={() => onUndelete?.(version.version)} className="flex h-6 w-6 items-center justify-center rounded text-foreground-400 hover:bg-emerald-50 hover:text-emerald-700"><i className="ri-arrow-go-back-line text-xs" aria-hidden="true" /></button>}
                    {!version.deletionTime && onCompare && <button type="button" aria-label={`Compare version ${version.version}`} onClick={onCompare} className="flex h-6 w-6 items-center justify-center rounded text-foreground-400 hover:bg-primary-50 hover:text-primary-700"><i className="ri-scales-line text-xs" aria-hidden="true" /></button>}
                    {current && !version.deletionTime && permissions?.canDeleteLatest && <button type="button" aria-label={`Delete current version ${version.version}`} onClick={() => onDeleteLatest?.(version.version)} className="flex h-6 w-6 items-center justify-center rounded text-foreground-400 hover:bg-red-50 hover:text-red-600"><i className="ri-delete-bin-line text-xs" aria-hidden="true" /></button>}
                    {!current && !version.deletionTime && permissions?.canDeleteVersions && <button type="button" aria-label={`Delete version ${version.version}`} onClick={() => onDeleteVersion?.(version.version)} className="flex h-6 w-6 items-center justify-center rounded text-foreground-400 hover:bg-red-50 hover:text-red-600"><i className="ri-delete-bin-line text-xs" aria-hidden="true" /></button>}
                    {!version.deletionTime && permissions?.canDestroy && <button type="button" aria-label={`Destroy version ${version.version}`} onClick={() => onDestroyVersion?.(version.version)} className="flex h-6 w-6 items-center justify-center rounded text-foreground-400 hover:bg-red-50 hover:text-red-700"><i className="ri-close-circle-line text-xs" aria-hidden="true" /></button>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {activeTab === 'metadata' && (
        <div className="space-y-3 p-3 text-xs">
          <dl className="space-y-2">
            <div className="flex justify-between gap-3"><dt className="text-foreground-500">Logical path</dt><dd className="break-all text-right font-mono text-foreground-800">{mount}/{path}</dd></div>
            <div className="flex justify-between"><dt className="text-foreground-500">Current version</dt><dd className="font-mono text-foreground-800">{history.currentVersion}</dd></div>
            <div className="flex justify-between"><dt className="text-foreground-500">Oldest version</dt><dd className="font-mono text-foreground-800">{history.oldestVersion}</dd></div>
          </dl>
          {Object.keys(history.customMetadata).length > 0 && (
            <div className="border-t border-background-200 pt-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-foreground-500">Custom metadata</p>
              {Object.entries(history.customMetadata).map(([key, value]) => <p key={key} className="mb-1 flex justify-between gap-3"><span className="font-mono text-foreground-600">{key}</span><span className="text-foreground-800">{value}</span></p>)}
            </div>
          )}
          {permissions?.canDeleteMetadata && (
            <div className="border-t border-background-200 pt-3">
              <button type="button" onClick={() => onDeleteMetadata?.(history.currentVersion)} className="text-xs font-medium text-red-600 hover:text-red-700">Delete all versions and metadata…</button>
            </div>
          )}
        </div>
      )}
    </Tabs>
  );
}
