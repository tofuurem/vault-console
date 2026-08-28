import { useEffect, useState } from 'react';

import Button from '@/components/base/Button';
import Drawer from '@/components/base/Drawer';
import { Input } from '@/components/base/Input';
import { normalizeVaultError } from '@/domain/vault/errors';
import type { KvV2MountConfig } from '@/domain/vault/kv-v2';
import { kvMountConfigFingerprint } from '@/domain/vault/kv-settings-snapshot';
import { parseMountConfigForm } from '@/domain/vault/mount-config-form';

interface KvMountConfigDrawerProps {
  readonly open: boolean;
  readonly mount: string;
  readonly onClose: () => void;
  readonly onLoad: (mount: string, signal: AbortSignal) => Promise<KvV2MountConfig>;
  readonly onSave: (mount: string, input: KvV2MountConfig) => Promise<void>;
}

export default function KvMountConfigDrawer({
  open,
  mount,
  onClose,
  onLoad,
  onSave,
}: KvMountConfigDrawerProps) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [maxVersions, setMaxVersions] = useState('0');
  const [casRequired, setCasRequired] = useState(false);
  const [deleteVersionAfter, setDeleteVersionAfter] = useState('0s');
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [baseline, setBaseline] = useState('');
  const [conflictConfig, setConflictConfig] = useState<KvV2MountConfig | null>(null);

  const applyConfig = (config: KvV2MountConfig) => {
    setMaxVersions(String(config.maxVersions));
    setCasRequired(config.casRequired);
    setDeleteVersionAfter(config.deleteVersionAfter);
    setBaseline(kvMountConfigFingerprint(config));
  };

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setStatus('loading');
    setLoadError('');
    setErrors([]);
    setSaveError('');
    setSaving(false);
    setConflictConfig(null);
    setBaseline('');
    void onLoad(mount, controller.signal).then((config) => {
      if (controller.signal.aborted) return;
      applyConfig(config);
      setStatus('ready');
    }).catch((cause: unknown) => {
      if (controller.signal.aborted) return;
      setLoadError(normalizeVaultError(cause).message);
      setStatus('error');
    });
    return () => controller.abort();
  }, [loadAttempt, mount, onLoad, open]);

  const requestClose = () => {
    if (!saving) onClose();
  };
  const save = async () => {
    const parsed = parseMountConfigForm({
      maxVersions,
      casRequired,
      deleteVersionAfter,
    });
    if (parsed.ok === false) {
      setErrors(parsed.errors);
      return;
    }
    setErrors([]);
    setSaveError('');
    setSaving(true);
    try {
      const fresh = await onLoad(mount, new AbortController().signal);
      if (!baseline || kvMountConfigFingerprint(fresh) !== baseline) {
        setConflictConfig(fresh);
        setSaving(false);
        return;
      }
      await onSave(mount, parsed.data);
      setSaving(false);
      onClose();
    } catch (cause) {
      setSaveError(normalizeVaultError(cause).message);
      setSaving(false);
    }
  };

  return (
    <Drawer open={open} onClose={requestClose} title="Configure KV v2 mount" width="520px">
      <div className="space-y-4 p-4">
        <div className="rounded-md border border-background-200 bg-background-100 px-3 py-2 text-xs">
          <span className="text-foreground-500">Mount </span>
          <span className="font-mono text-foreground-800">{mount}/config</span>
        </div>

        {status === 'loading' && (
          <div role="status" aria-label="Loading KV mount configuration" className="space-y-2">
            <div className="h-12 animate-pulse rounded-md bg-background-100" />
            <div className="h-24 animate-pulse rounded-md bg-background-100" />
            <p className="text-xs text-foreground-500">Reading the latest mount configuration from Vault…</p>
          </div>
        )}

        {status === 'error' && (
          <div role="alert" className="rounded-md border border-danger-200 bg-danger-50 p-3 text-xs text-danger-700">
            <p className="font-semibold">Mount configuration could not be loaded</p>
            <p className="mt-1">{loadError}</p>
            <button
              type="button"
              onClick={() => setLoadAttempt((attempt) => attempt + 1)}
              className="mt-2 font-semibold underline underline-offset-2"
            >
              Retry
            </button>
          </div>
        )}

        {status === 'ready' && (
          <>
            <p className="rounded-md border border-success-200 bg-success-50 px-3 py-2 text-[11px] text-success-700">
              Loaded fresh from Vault. Only KV v2 data-retention defaults are changed here.
            </p>
            {conflictConfig && (
              <div role="alert" className="rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-xs text-warning-800">
                <p className="font-semibold">Mount configuration changed in Vault after this editor was opened.</p>
                <p className="mt-1 leading-5">Your draft was not saved. Load the latest configuration before reviewing the change again.</p>
                <button
                  type="button"
                  onClick={() => {
                    applyConfig(conflictConfig);
                    setConflictConfig(null);
                    setSaveError('');
                  }}
                  className="mt-2 font-semibold underline underline-offset-2"
                >
                  Load latest configuration
                </button>
              </div>
            )}
            {(errors.length > 0 || saveError) && (
              <div role="alert" className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-700">
                {errors.map((error) => <p key={error}>{error}</p>)}
                {saveError && <p>{saveError}</p>}
              </div>
            )}
            <Input
              label="Default maximum versions"
              value={maxVersions}
              onChange={(event) => setMaxVersions(event.target.value)}
              inputMode="numeric"
              min="0"
            />
            <Input
              label="Default delete delay"
              value={deleteVersionAfter}
              onChange={(event) => setDeleteVersionAfter(event.target.value)}
              placeholder="0s"
              monospace
            />
            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-background-200 p-3 text-xs text-foreground-700">
              <input
                type="checkbox"
                checked={casRequired}
                onChange={(event) => setCasRequired(event.target.checked)}
              />
              <span><strong>Require check-and-set for this mount</strong><span className="mt-0.5 block text-[11px] text-foreground-500">All writes must include an expected version.</span></span>
            </label>
            <div className="rounded-md border border-background-200 bg-background-100 px-3 py-2 text-[11px] leading-5 text-foreground-500">
              Mount deletion and unrelated tune settings are intentionally not available in this workflow.
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" onClick={requestClose} disabled={saving}>Cancel</Button>
              <Button size="sm" variant="primary" loading={saving} onClick={() => void save()}>
                Save mount configuration
              </Button>
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
}
