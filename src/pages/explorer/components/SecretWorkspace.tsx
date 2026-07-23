import { useEffect, useId, useMemo, useRef, useState } from 'react';

import Button from '@/components/base/Button';
import Tabs from '@/components/base/Tabs';
import { useDialogFocus } from '@/components/base/useDialogFocus';
import type { KvV2Secret } from '@/domain/vault/contracts';
import { normalizeVaultError } from '@/domain/vault/errors';
import {
  formatSecretJson,
  parseSecretJson,
  redactSecretValue,
  summarizeSecretChanges,
} from '@/domain/vault/secret-json';
import JsonSecretEditor from './JsonSecretEditor';
import SecretDataTree from './SecretDataTree';

export type SecretWorkspaceMode = 'view' | 'edit';

interface SecretWorkspaceProps {
  readonly open: boolean;
  readonly initialMode: SecretWorkspaceMode;
  readonly secret?: KvV2Secret;
  readonly canEdit: boolean;
  readonly onClose: () => void;
  readonly onSave: (data: Readonly<Record<string, unknown>>) => Promise<void>;
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function SecretWorkspace({
  open,
  initialMode,
  secret,
  canEdit,
  onClose,
  onSave,
}: SecretWorkspaceProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [mode, setMode] = useState<SecretWorkspaceMode>('view');
  const [activeTab, setActiveTab] = useState('tree');
  const [revealAll, setRevealAll] = useState(false);
  const [rawJson, setRawJson] = useState('{}');
  const [initialJson, setInitialJson] = useState('{}');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');

  useEffect(() => {
    if (!open || !secret) return;
    const formatted = formatSecretJson(secret.data);
    setMode(initialMode === 'edit' && canEdit ? 'edit' : 'view');
    setActiveTab('tree');
    setRevealAll(false);
    setRawJson(formatted);
    setInitialJson(formatted);
    setSaving(false);
    setSaveError('');
    setCopyStatus('');
  }, [canEdit, initialMode, open, secret]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);

  const parsed = useMemo(() => parseSecretJson(rawJson), [rawJson]);
  const dirty = rawJson !== initialJson;
  const changes = parsed.ok && secret
    ? summarizeSecretChanges(secret.data, parsed.data)
    : { added: 0, changed: 0, removed: 0 };

  const confirmDiscard = () => !dirty || window.confirm('Discard unsaved secret changes?');
  const requestClose = () => {
    if (saving) return;
    if (mode === 'edit' && !confirmDiscard()) return;
    onClose();
  };
  useDialogFocus(open && Boolean(secret), dialogRef, requestClose);

  if (!open || !secret) return null;

  const enterEdit = () => {
    const formatted = formatSecretJson(secret.data);
    setRawJson(formatted);
    setInitialJson(formatted);
    setSaveError('');
    setMode('edit');
  };
  const cancelEdit = () => {
    if (!confirmDiscard()) return;
    setRawJson(initialJson);
    setSaveError('');
    setMode('view');
  };
  const formatEditor = () => {
    if (parsed.ok) setRawJson(formatSecretJson(parsed.data));
  };
  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(formatSecretJson(secret.data));
      setCopyStatus('JSON copied');
      setTimeout(() => setCopyStatus(''), 1_500);
    } catch {
      setCopyStatus('Clipboard unavailable');
    }
  };
  const save = async () => {
    if (!parsed.ok || !dirty) return;
    setSaving(true);
    setSaveError('');
    try {
      await onSave(parsed.data);
      setSaving(false);
      onClose();
    } catch (cause) {
      const error = normalizeVaultError(cause);
      setSaveError(error.code === 'conflict'
        ? 'Vault has a newer version. Reload the secret before applying these changes.'
        : error.message);
      setSaving(false);
    }
  };
  const rawReadValue = formatSecretJson(
    (revealAll ? secret.data : redactSecretValue(secret.data)) as Readonly<Record<string, unknown>>,
  );

  return (
    <div className="fixed inset-0 z-[90] bg-background-50">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={saving}
        tabIndex={-1}
        className="flex h-full min-h-0 flex-col bg-background-50"
      >
        <header className="shrink-0 border-b border-background-200 bg-background-50">
          <div className="flex min-h-14 flex-wrap items-center gap-3 px-3 py-2 sm:px-5">
            <button type="button" aria-label="Close secret workspace" onClick={requestClose} disabled={saving} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-foreground-500 hover:bg-background-100 hover:text-foreground-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 disabled:opacity-50">
              <i className="ri-arrow-left-line text-base" aria-hidden="true" />
            </button>
            <div className="min-w-[180px] flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id={titleId} className="break-all font-mono text-sm font-semibold text-foreground-900">{secret.mount}/{secret.path}</h2>
                <span className="rounded bg-primary-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-primary-700">v{secret.metadata.version}</span>
                <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${mode === 'edit' ? 'bg-amber-100 text-amber-700' : 'bg-background-200 text-foreground-500'}`}>{mode}</span>
              </div>
              <p className="mt-0.5 text-[10px] text-foreground-400">Created {formatTime(secret.metadata.createdTime)} · save creates v{secret.metadata.version + 1}</p>
            </div>

            <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
              {mode === 'view' ? (
                <>
                  <span role="status" aria-live="polite" className="sr-only">{copyStatus}</span>
                  <Button size="sm" onClick={() => void copyJson()}><i className="ri-file-copy-line" aria-hidden="true" /> Copy JSON</Button>
                  <Button size="sm" onClick={() => setRevealAll((current) => !current)}><i className={`${revealAll ? 'ri-eye-off-line' : 'ri-eye-line'}`} aria-hidden="true" /> {revealAll ? 'Mask values' : 'Reveal values'}</Button>
                  {canEdit && <Button size="sm" variant="primary" onClick={enterEdit}><i className="ri-edit-line" aria-hidden="true" /> Edit secret</Button>}
                </>
              ) : (
                <>
                  <Button size="sm" onClick={cancelEdit} disabled={saving}>Cancel edit</Button>
                  <Button size="sm" variant="primary" onClick={() => void save()} loading={saving} disabled={!parsed.ok || !dirty}>Save version {secret.metadata.version + 1}</Button>
                </>
              )}
            </div>
          </div>
        </header>

        {mode === 'view' ? (
          <main className="min-h-0 flex-1 overflow-hidden" id="secret-workspace-content">
            <Tabs
              tabs={[
                { key: 'tree', label: 'Tree', icon: 'ri-node-tree' },
                { key: 'json', label: 'JSON', icon: 'ri-braces-line' },
              ]}
              activeTab={activeTab}
              onChange={setActiveTab}
            >
              {activeTab === 'tree' ? (
                <div className="mx-auto h-full max-w-[1600px] overflow-auto p-3 sm:p-5">
                  <SecretDataTree data={secret.data} revealAll={revealAll} />
                </div>
              ) : (
                <div className="h-full overflow-auto bg-background-100 p-3 sm:p-5">
                  <pre className="mx-auto min-h-full max-w-[1600px] overflow-auto rounded-lg border border-background-300 bg-background-50 p-4 font-mono text-xs leading-6 text-foreground-800"><code>{rawReadValue}</code></pre>
                </div>
              )}
            </Tabs>
          </main>
        ) : (
          <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden bg-background-100 p-3 sm:p-5" id="secret-workspace-content">
            <JsonSecretEditor
              value={rawJson}
              onChange={setRawJson}
              onFormat={formatEditor}
              validationError={parsed.ok === false ? parsed.message : undefined}
              validationLocation={parsed.ok === false ? parsed.location : undefined}
              disabled={saving}
            />
            <footer className="flex shrink-0 flex-wrap items-center gap-3 rounded-lg border border-background-300 bg-background-50 px-3 py-2">
              <div className="flex items-center gap-1.5 text-[10px]">
                <span className="rounded bg-emerald-50 px-2 py-1 font-medium text-emerald-700"><strong className="mr-1 font-mono tabular-nums">{changes.added}</strong>added</span>
                <span className="rounded bg-amber-50 px-2 py-1 font-medium text-amber-700"><strong className="mr-1 font-mono tabular-nums">{changes.changed}</strong>changed</span>
                <span className="rounded bg-red-50 px-2 py-1 font-medium text-red-700"><strong className="mr-1 font-mono tabular-nums">{changes.removed}</strong>removed</span>
              </div>
              <p className="min-w-[220px] flex-1 text-[10px] leading-4 text-foreground-500">Check-and-set is fixed to v{secret.metadata.version}. Concurrent changes fail instead of being overwritten.</p>
              {!dirty && <span className="text-[10px] text-foreground-400">No changes</span>}
              {saveError && <p role="alert" className="w-full border-t border-red-100 pt-2 text-xs text-red-700">{saveError}</p>}
            </footer>
          </main>
        )}
      </div>
    </div>
  );
}
