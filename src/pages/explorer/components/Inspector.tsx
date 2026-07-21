import { useState, useCallback, useRef, useEffect } from 'react';
import type { VaultSecret } from '@/mocks/vault';
import Tabs from '@/components/base/Tabs';
import Tooltip from '@/components/base/Tooltip';
import Button from '@/components/base/Button';
import Badge from '@/components/base/Badge';

interface InspectorProps {
  secret: VaultSecret | null;
  currentPath: string;
  mount: string;
  onEdit: (secret: VaultSecret) => void;
  onVersionCompare?: (secret: VaultSecret) => void;
  connectionPermissions: { can_create: boolean; can_delete: boolean; can_undelete: boolean; can_destroy: boolean };
}

function MaskedValue({ value }: { value: string }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleReveal = () => {
    setRevealed(true);
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setRevealed(false), 8000);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard not available
    }
  };

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  const isMultiline = value.includes('\n');
  const displayValue = isMultiline ? value : value;
  const maskLength = Math.min(value.length, 24);

  return (
    <div className="flex items-start gap-1.5 group">
      <div className="flex-1 min-w-0">
        {revealed ? (
          <span className={`text-sm text-foreground-800 break-all ${isMultiline ? 'whitespace-pre-wrap font-mono' : 'font-mono'}`}>
            {displayValue}
          </span>
        ) : (
          <span className="font-mono text-sm text-foreground-400 select-none">{'•'.repeat(maskLength)}</span>
        )}
      </div>
      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <Tooltip content={revealed ? 'Hide value' : 'Reveal value'}>
          <button onClick={handleReveal} className="w-5 h-5 flex items-center justify-center rounded text-foreground-400 hover:text-foreground-700 cursor-pointer">
            <i className={`${revealed ? 'ri-eye-off-line' : 'ri-eye-line'} text-xs`} />
          </button>
        </Tooltip>
        <Tooltip content={copied ? 'Copied!' : 'Copy value'}>
          <button onClick={handleCopy} className="w-5 h-5 flex items-center justify-center rounded text-foreground-400 hover:text-foreground-700 cursor-pointer">
            <i className={`${copied ? 'ri-check-line text-emerald-500' : 'ri-file-copy-line'} text-xs`} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function Inspector({
  secret,
  currentPath,
  mount,
  onEdit,
  onVersionCompare,
  connectionPermissions,
}: InspectorProps) {
  const [activeTab, setActiveTab] = useState('data');
  const [clipboardMsg, setClipboardMsg] = useState('');

  const copyCliCmd = useCallback(() => {
    const cmd = `vault kv get -mount=${mount.replace(/\/$/, '')} ${secret?.path.replace(mount, '')}`;
    navigator.clipboard.writeText(cmd).then(() => {
      setClipboardMsg('Copied!');
      setTimeout(() => setClipboardMsg(''), 1500);
    });
  }, [secret, mount]);

  if (!secret) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-4">
        <div className="w-10 h-10 mb-2 flex items-center justify-center rounded-full bg-background-200">
          <i className="ri-file-info-line text-lg text-foreground-400" />
        </div>
        <p className="text-xs text-foreground-500">Select a secret to inspect</p>
      </div>
    );
  }

  const currentVersion = secret.versions.find((v) => v.state === 'current') || secret.versions[0];

  const dataTab = (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[11px] font-medium text-foreground-500">Current version</span>
          <span className="ml-1.5 text-xs font-mono text-foreground-800">v{secret.metadata.current_version}</span>
        </div>
        <div className="flex items-center gap-1">
          <Tooltip content={clipboardMsg || 'Copy CLI command'}>
            <button onClick={copyCliCmd} className="w-6 h-6 flex items-center justify-center rounded-md text-foreground-400 hover:text-foreground-700 hover:bg-background-100 cursor-pointer">
              <i className="ri-terminal-line text-xs" />
            </button>
          </Tooltip>
          {connectionPermissions.can_create && (
            <Button size="sm" variant="primary" onClick={() => onEdit(secret)}>
              Edit secret
            </Button>
          )}
        </div>
      </div>

      <div className="text-[10px] text-foreground-400 space-y-0.5">
        <div>Created: {formatTime(secret.metadata.created_time)}</div>
        <div>Updated: {formatTime(secret.metadata.updated_time)}</div>
        <div>By: {currentVersion?.created_by}</div>
      </div>

      <div className="border border-background-200 rounded-md overflow-hidden">
        <div className="grid grid-cols-[140px_1fr] bg-background-100 px-2.5 py-1.5 border-b border-background-200">
          <span className="text-[11px] font-semibold text-foreground-500 uppercase tracking-wider">Key</span>
          <span className="text-[11px] font-semibold text-foreground-500 uppercase tracking-wider">Value</span>
        </div>
        <div className="divide-y divide-background-100">
          {currentVersion && Object.entries(currentVersion.data).map(([key, value]) => (
            <div key={key} className="grid grid-cols-[140px_1fr] px-2.5 py-2">
              <span className="text-xs font-mono text-foreground-700 font-medium break-all pr-2">{key}</span>
              <MaskedValue value={value} />
            </div>
          ))}
        </div>
      </div>

      {Object.keys(secret.metadata.custom_metadata).length > 0 && (
        <div>
          <span className="text-[11px] font-medium text-foreground-500">Custom Metadata</span>
          <div className="mt-1 space-y-1">
            {Object.entries(secret.metadata.custom_metadata).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2 text-xs">
                <span className="font-mono text-foreground-600">{k}</span>
                <span className="text-foreground-400">=</span>
                <span className="text-foreground-800">{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const versionsTab = (
    <div className="p-3">
      <div className="space-y-1">
        {secret.versions.map((ver) => {
          const isCurrent = ver.state === 'current';
          const isDeleted = ver.state === 'deleted';
          const isDestroyed = ver.state === 'destroyed';

          return (
            <div
              key={ver.version}
              className={`flex items-center gap-3 px-2.5 py-2 rounded-md border ${
                isCurrent ? 'border-primary-200 bg-primary-50/30' : 'border-background-200'
              } ${isDestroyed ? 'opacity-50' : ''}`}
            >
              <span className="font-mono text-xs font-semibold text-foreground-800 w-8 shrink-0">v{ver.version}</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-foreground-700">
                  {isCurrent && <Badge variant="success">Current</Badge>}
                  {isDeleted && <Badge variant="danger">Deleted</Badge>}
                  {isDestroyed && <Badge variant="danger">Destroyed</Badge>}
                  {ver.state === 'superseded' && <Badge variant="info">Superseded</Badge>}
                </div>
                <div className="text-[10px] text-foreground-400 mt-0.5">
                  {formatTime(ver.created_at)} · {ver.created_by}
                </div>
              </div>
              {!isDestroyed && (
                <div className="flex items-center gap-0.5">
                  {ver.state === 'deleted' && connectionPermissions.can_undelete && (
                    <Tooltip content="Undelete">
                      <button className="w-6 h-6 flex items-center justify-center rounded text-foreground-400 hover:text-emerald-600 hover:bg-background-100 cursor-pointer">
                        <i className="ri-arrow-go-back-line text-xs" />
                      </button>
                    </Tooltip>
                  )}
                  {!isDeleted && !isCurrent && connectionPermissions.can_delete && (
                    <Tooltip content="Soft delete">
                      <button className="w-6 h-6 flex items-center justify-center rounded text-foreground-400 hover:text-red-500 hover:bg-background-100 cursor-pointer">
                        <i className="ri-delete-bin-line text-xs" />
                      </button>
                    </Tooltip>
                  )}
                  {!isDeleted && (
                    <button
                      onClick={() => onVersionCompare?.(secret)}
                      className="w-6 h-6 flex items-center justify-center rounded text-foreground-400 hover:text-primary-600 hover:bg-background-100 cursor-pointer"
                    >
                      <Tooltip content="Compare">
                        <i className="ri-scales-line text-xs" />
                      </Tooltip>
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  const metadataTab = (
    <div className="p-3 space-y-3">
      <div className="space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-foreground-500">Secret path</span>
          <span className="font-mono text-foreground-800">{secret.path}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-foreground-500">Mount</span>
          <span className="font-mono text-foreground-800">{secret.mount}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-foreground-500">Current version</span>
          <span className="font-mono text-foreground-800">{secret.metadata.current_version}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-foreground-500">Max versions</span>
          <span className="font-mono text-foreground-800">{secret.metadata.max_versions}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-foreground-500">CAS required</span>
          <span className="text-foreground-800">{secret.metadata.cas_required ? 'Yes' : 'No'}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-foreground-500">Created</span>
          <span className="text-foreground-800">{formatTime(secret.metadata.created_time)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-foreground-500">Updated</span>
          <span className="text-foreground-800">{formatTime(secret.metadata.updated_time)}</span>
        </div>
      </div>

      {Object.keys(secret.metadata.custom_metadata).length > 0 && (
        <div>
          <div className="text-[11px] font-medium text-foreground-500 mb-1.5">Custom Metadata</div>
          <div className="space-y-1.5">
            {Object.entries(secret.metadata.custom_metadata).map(([k, v]) => (
              <div key={k} className="flex justify-between text-xs">
                <span className="font-mono text-foreground-600">{k}</span>
                <span className="text-foreground-800">{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const tabs = [
    { key: 'data', label: 'Data', icon: 'ri-database-2-line' },
    { key: 'versions', label: 'Versions', icon: 'ri-history-line', count: secret.versions.length },
    { key: 'metadata', label: 'Metadata', icon: 'ri-information-line' },
  ];

  return (
    <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab}>
      {activeTab === 'data' && dataTab}
      {activeTab === 'versions' && versionsTab}
      {activeTab === 'metadata' && metadataTab}
    </Tabs>
  );
}
