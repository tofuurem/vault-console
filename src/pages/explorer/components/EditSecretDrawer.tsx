import { useEffect, useMemo, useState } from 'react';

import Button from '@/components/base/Button';
import Drawer from '@/components/base/Drawer';
import { Textarea } from '@/components/base/Input';
import type { KvV2Secret } from '@/domain/vault/contracts';
import { normalizeVaultError } from '@/domain/vault/errors';

interface EditSecretDrawerProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly secret?: KvV2Secret;
  readonly onSave: (data: Readonly<Record<string, unknown>>) => Promise<void>;
}

interface EditablePair {
  readonly id: number;
  readonly key: string;
  readonly originalValue: unknown;
  readonly value: string;
}

let nextEditPairId = 0;

function printable(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value) ?? String(value);
}

export default function EditSecretDrawer({ open, onClose, secret, onSave }: EditSecretDrawerProps) {
  const [step, setStep] = useState<'edit' | 'review'>('edit');
  const [pairs, setPairs] = useState<EditablePair[]>([]);
  const [rawMode, setRawMode] = useState(false);
  const [rawJson, setRawJson] = useState('{}');
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (!open || !secret) return;
    setPairs(Object.entries(secret.data).map(([key, value]) => ({ id: ++nextEditPairId, key, originalValue: value, value: printable(value) })));
    setRawJson(JSON.stringify(secret.data, null, 2));
    setStep('edit');
    setRawMode(false);
    setErrors([]);
    setSaveError('');
  }, [open, secret]);

  const data = useMemo<Readonly<Record<string, unknown>>>(() => {
    if (rawMode) {
      try { return JSON.parse(rawJson) as Record<string, unknown>; } catch { return {}; }
    }
    return Object.fromEntries(pairs.filter((pair) => pair.key.trim()).map((pair) => [
      pair.key.trim(),
      pair.value === printable(pair.originalValue) ? pair.originalValue : pair.value,
    ]));
  }, [pairs, rawJson, rawMode]);

  if (!secret) return null;

  const validate = () => {
    const nextErrors: string[] = [];
    if (rawMode) {
      try {
        const parsed = JSON.parse(rawJson);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) nextErrors.push('Raw JSON must be an object.');
      } catch { nextErrors.push('Raw JSON is not valid.'); }
    } else {
      const keys = pairs.map((pair) => pair.key.trim()).filter(Boolean);
      if (!keys.length) nextErrors.push('Keep at least one secret key.');
      if (new Set(keys).size !== keys.length) nextErrors.push('Secret keys must be unique.');
    }
    setErrors(nextErrors);
    return nextErrors.length === 0;
  };
  const save = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await onSave(data);
      setSaving(false);
      onClose();
    } catch (cause) {
      const error = normalizeVaultError(cause);
      setSaveError(error.code === 'conflict'
        ? 'Vault has a newer version. Close this editor, reload the secret, and apply your changes again.'
        : error.message);
      setSaving(false);
    }
  };
  const oldKeys = Object.keys(secret.data);
  const newKeys = Object.keys(data);
  const added = newKeys.filter((key) => !oldKeys.includes(key));
  const removed = oldKeys.filter((key) => !newKeys.includes(key));
  const changed = newKeys.filter((key) => oldKeys.includes(key) && JSON.stringify(secret.data[key]) !== JSON.stringify(data[key]));

  return (
    <Drawer open={open} onClose={onClose} title="Edit secret" width="560px">
      <div className="space-y-4 p-4">
        {(errors.length > 0 || saveError) && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{errors.map((error) => <p key={error}>{error}</p>)}{saveError && <p>{saveError}</p>}</div>}
        {step === 'edit' ? (
          <>
            <div className="rounded-md border border-background-200 bg-background-100/50 p-3 text-xs">
              <p className="break-all font-mono text-foreground-800">{secret.mount}/{secret.path}</p>
              <p className="mt-1 text-[11px] text-foreground-500">Source v{secret.metadata.version} · save creates v{secret.metadata.version + 1}</p>
            </div>
              <div className="flex items-center justify-between"><h3 className="text-xs font-semibold text-foreground-700">Secret data</h3><div className="flex gap-3"><button type="button" onClick={() => setRawMode((current) => !current)} className="text-[11px] text-primary-600">{rawMode ? 'Structured fields' : 'Raw JSON'}</button>{!rawMode && <button type="button" onClick={() => setPairs((current) => [...current, { id: ++nextEditPairId, key: '', originalValue: undefined, value: '' }])} className="text-[11px] text-primary-600">+ Add field</button>}</div></div>
            {rawMode ? (
              <Textarea aria-label="Secret JSON" value={rawJson} onChange={(event) => setRawJson(event.target.value)} rows={14} monospace className="text-xs" />
            ) : (
              <div className="space-y-1.5">
                {pairs.map((pair, index) => (
                  <div key={pair.id} className="grid grid-cols-[1fr_1fr_32px] gap-2">
                    <input aria-label="Secret key" value={pair.key} onChange={(event) => setPairs((current) => current.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, key: event.target.value } : candidate))} className="h-8 rounded-md border border-background-300 bg-background-50 px-2 font-mono text-xs focus:outline-none focus:border-primary-400" />
                    <input aria-label={`Value for ${pair.key || 'new key'}`} value={pair.value} onChange={(event) => setPairs((current) => current.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, value: event.target.value } : candidate))} className="h-8 rounded-md border border-background-300 bg-background-50 px-2 font-mono text-xs focus:outline-none focus:border-primary-400" />
                    <button type="button" aria-label="Remove field" onClick={() => setPairs((current) => current.filter((_, candidateIndex) => candidateIndex !== index))} className="flex h-8 w-8 items-center justify-center rounded-md text-foreground-400 hover:bg-red-50 hover:text-red-600"><i className="ri-close-line" aria-hidden="true" /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">Check-and-set is fixed to version {secret.metadata.version}. A concurrent update will fail instead of being overwritten.</div>
            <div className="flex justify-end gap-2"><Button size="sm" onClick={onClose}>Cancel</Button><Button size="sm" variant="primary" onClick={() => { if (validate()) setStep('review'); }}>Review changes</Button></div>
          </>
        ) : (
          <>
            <div><p className="font-mono text-[9px] font-semibold uppercase tracking-[0.15em] text-primary-600">CAS {secret.metadata.version}</p><h3 className="mt-1 text-sm font-semibold text-foreground-900">Create version {secret.metadata.version + 1}</h3></div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded bg-emerald-50 p-2 text-emerald-700"><strong className="block font-mono text-base">{added.length}</strong>added</div><div className="rounded bg-amber-50 p-2 text-amber-700"><strong className="block font-mono text-base">{changed.length}</strong>changed</div><div className="rounded bg-red-50 p-2 text-red-700"><strong className="block font-mono text-base">{removed.length}</strong>removed</div></div>
            <p className="text-[11px] leading-5 text-foreground-500">Secret values stay hidden in this review. Vault preserves the previous version.</p>
            <div className="flex justify-between"><Button size="sm" onClick={() => setStep('edit')} disabled={saving}>Back</Button><div className="flex gap-2"><Button size="sm" onClick={onClose} disabled={saving}>Cancel</Button><Button size="sm" variant="primary" onClick={() => void save()} loading={saving}>Save version {secret.metadata.version + 1}</Button></div></div>
          </>
        )}
      </div>
    </Drawer>
  );
}
