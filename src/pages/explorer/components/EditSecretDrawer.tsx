import { useState } from 'react';
import Drawer from '@/components/base/Drawer';
import Button from '@/components/base/Button';
import { Textarea } from '@/components/base/Input';
import type { VaultSecret } from '@/mocks/vault';

interface KeyValuePair {
  id: string;
  key: string;
  value: string;
  originalValue: string;
  changed: boolean;
}

interface EditSecretDrawerProps {
  open: boolean;
  onClose: () => void;
  secret: VaultSecret | null;
  onSave: (secret: VaultSecret, data: Record<string, string>) => void;
}

let pairId = 1000;
function nextId() {
  pairId += 1;
  return `edit-${pairId}`;
}

export default function EditSecretDrawer({ open, onClose, secret, onSave }: EditSecretDrawerProps) {
  const [step, setStep] = useState<'edit' | 'review'>('edit');
  const [pairs, setPairs] = useState<KeyValuePair[]>([]);
  const [rawJsonMode, setRawJsonMode] = useState(false);
  const [rawJson, setRawJson] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [initialized, setInitialized] = useState(false);

  if (secret && !initialized) {
    const cv = secret.versions.find((v) => v.state === 'current') || secret.versions[0];
    const entries = Object.entries(cv.data || {}).map(([k, v]) => ({
      id: nextId(),
      key: k,
      value: v,
      originalValue: v,
      changed: false,
    }));
    if (entries.length === 0) {
      entries.push({ id: nextId(), key: '', value: '', originalValue: '', changed: false });
    }
    setPairs(entries);
    setRawJson(JSON.stringify(cv.data || {}, null, 2));
    setInitialized(true);
  }

  const addPair = () => {
    setPairs([...pairs, { id: nextId(), key: '', value: '', originalValue: '', changed: true }]);
  };

  const removePair = (id: string) => {
    if (pairs.length <= 1) return;
    setPairs(pairs.filter((p) => p.id !== id));
  };

  const updatePair = (id: string, field: 'key' | 'value', val: string) => {
    setPairs(pairs.map((p) => {
      if (p.id !== id) return p;
      const updated = { ...p, [field]: val };
      updated.changed = updated.key !== p.originalValue || updated.value !== p.originalValue ||
        (field === 'key' && updated.key !== p.originalValue) ||
        (field === 'value' && updated.value !== p.originalValue);
      return updated;
    }));
  };

  const validate = (): boolean => {
    const errs: string[] = [];

    if (!rawJsonMode) {
      const filledPairs = pairs.filter((p) => p.key.trim() || p.value.trim());
      if (filledPairs.length === 0) {
        errs.push('At least one key/value pair is required');
      }
      const keys = filledPairs.filter((p) => p.key.trim()).map((p) => p.key.trim());
      const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
      if (dupes.length > 0) {
        errs.push(`Duplicate keys: ${dupes.join(', ')}`);
      }
    } else {
      try {
        JSON.parse(rawJson);
      } catch {
        errs.push('Invalid JSON');
      }
    }

    setErrors(errs);
    return errs.length === 0;
  };

  const getFinalData = (): Record<string, string> => {
    if (rawJsonMode) return JSON.parse(rawJson);
    const data: Record<string, string> = {};
    pairs.filter((p) => p.key.trim()).forEach((p) => { data[p.key.trim()] = p.value; });
    return data;
  };

  const getAddedKeys = (): string[] => {
    if (!secret) return [];
    const cv = secret.versions.find((v) => v.state === 'current') || secret.versions[0];
    const oldKeys = Object.keys(cv.data || {});
    const newKeys = Object.keys(getFinalData());
    return newKeys.filter((k) => !oldKeys.includes(k));
  };

  const getChangedKeys = (): string[] => {
    return pairs.filter((p) => p.changed && p.key.trim() && p.originalValue !== undefined).map((p) => p.key.trim());
  };

  const getRemovedKeys = (): string[] => {
    if (!secret) return [];
    const cv = secret.versions.find((v) => v.state === 'current') || secret.versions[0];
    const oldKeys = Object.keys(cv.data || {});
    const newKeys = Object.keys(getFinalData());
    return oldKeys.filter((k) => !newKeys.includes(k));
  };

  const handleNext = () => {
    if (validate()) setStep('review');
  };

  const handleSave = () => {
    if (secret) {
      onSave(secret, getFinalData());
    }
    reset();
    onClose();
  };

  const reset = () => {
    setStep('edit');
    setPairs([]);
    setRawJson('');
    setErrors([]);
    setRawJsonMode(false);
    setInitialized(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  if (!secret) return null;

  const sourceVersion = secret.versions.find((v) => v.state === 'current') || secret.versions[0];

  return (
    <Drawer open={open} onClose={handleClose} title="Edit Secret" width="560px">
      {step === 'edit' && (
        <div className="p-4 space-y-4">
          {errors.length > 0 && (
            <div className="px-3 py-2 rounded-md bg-red-50 border border-red-200 space-y-0.5">
              {errors.map((e, i) => (
                <div key={i} className="text-xs text-red-700 flex items-center gap-1.5">
                  <i className="ri-error-warning-line text-sm shrink-0" />{e}
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-foreground-500 shrink-0">Path</span>
              <span className="font-mono text-foreground-800">{secret.path}</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-foreground-500 shrink-0">Source version</span>
              <span className="font-mono text-foreground-800">v{sourceVersion.version}</span>
            </div>
            <p className="text-[11px] text-foreground-400">
              Saving will create a new version (v{secret.metadata.current_version + 1}). The current version is preserved.
            </p>
          </div>

          <div className="border-t border-background-200 pt-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-foreground-700">Key / Value Pairs</span>
                <button
                  onClick={() => setRawJsonMode(!rawJsonMode)}
                  className="text-[10px] px-1.5 py-0.5 rounded border border-background-300 text-foreground-500 hover:text-foreground-700 cursor-pointer"
                >
                  {rawJsonMode ? 'Structured' : 'Raw JSON'}
                </button>
              </div>
              {!rawJsonMode && (
                <button onClick={addPair} className="text-xs text-primary-600 hover:text-primary-700 cursor-pointer flex items-center gap-1">
                  <i className="ri-add-line text-sm" />Add field
                </button>
              )}
            </div>

            {rawJsonMode ? (
              <Textarea value={rawJson} onChange={(e) => setRawJson(e.target.value)} rows={10} monospace className="text-xs" />
            ) : (
              <div className="space-y-1.5">
                <div className="grid grid-cols-[1fr_1fr_32px] gap-2 text-[11px] font-medium text-foreground-500 px-1">
                  <span>Key</span><span>Value</span><span />
                </div>
                {pairs.map((pair) => (
                  <div key={pair.id} className={`grid grid-cols-[1fr_1fr_32px] gap-2 ${pair.changed ? 'bg-amber-50/50 rounded -mx-1 px-1 py-0.5' : ''}`}>
                    <input
                      type="text"
                      value={pair.key}
                      onChange={(e) => updatePair(pair.id, 'key', e.target.value)}
                      className={`h-8 px-2 text-xs font-mono rounded-md border bg-background-50 focus:outline-none focus:border-primary-400 text-foreground-900 ${pair.changed && pair.key !== pair.originalValue ? 'border-amber-400' : 'border-background-300'}`}
                    />
                    <div className="relative">
                      <input
                        type="text"
                        value={pair.value}
                        onChange={(e) => updatePair(pair.id, 'value', e.target.value)}
                        className={`w-full h-8 px-2 text-xs font-mono rounded-md border bg-background-50 focus:outline-none focus:border-primary-400 text-foreground-900 ${pair.changed ? 'border-amber-400' : 'border-background-300'}`}
                      />
                    </div>
                    <button
                      onClick={() => removePair(pair.id)}
                      disabled={pairs.length <= 1}
                      className="w-8 h-8 flex items-center justify-center rounded-md text-foreground-400 hover:text-red-500 hover:bg-background-100 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <i className="ri-close-line text-sm" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="px-3 py-2 rounded-md bg-amber-50 border border-amber-200">
            <p className="text-[11px] text-amber-700">
              Check-and-set: if this secret has been modified since you opened it, saving will fail with a version conflict.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={handleClose}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={handleNext}>Review changes</Button>
          </div>
        </div>
      )}

      {step === 'review' && (
        <div className="p-4 space-y-4">
          <span className="text-[11px] font-semibold text-foreground-500 uppercase tracking-wider">Review Changes</span>

          <div className="space-y-3">
            <div>
              <span className="text-xs font-medium text-foreground-700">Target</span>
              <div className="text-xs font-mono text-foreground-800 mt-0.5">{secret.path} → v{secret.metadata.current_version + 1}</div>
            </div>

            {getAddedKeys().length > 0 && (
              <div>
                <span className="text-xs font-medium text-emerald-700">Keys being added</span>
                <div className="mt-1 space-y-0.5">
                  {getAddedKeys().map((k) => (
                    <div key={k} className="text-xs font-mono text-emerald-700 pl-2 border-l-2 border-emerald-400">+ {k}</div>
                  ))}
                </div>
              </div>
            )}

            {getChangedKeys().length > 0 && (
              <div>
                <span className="text-xs font-medium text-amber-700">Keys being changed</span>
                <div className="mt-1 space-y-0.5">
                  {getChangedKeys().map((k) => (
                    <div key={k} className="text-xs font-mono text-amber-700 pl-2 border-l-2 border-amber-400">~ {k}</div>
                  ))}
                </div>
              </div>
            )}

            {getRemovedKeys().length > 0 && (
              <div>
                <span className="text-xs font-medium text-red-700">Keys being removed</span>
                <div className="mt-1 space-y-0.5">
                  {getRemovedKeys().map((k) => (
                    <div key={k} className="text-xs font-mono text-red-700 pl-2 border-l-2 border-red-400">- {k}</div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button variant="secondary" size="sm" onClick={() => setStep('edit')}>
              <i className="ri-arrow-left-line" />Back to edit
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={handleClose}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={handleSave}>Save version {secret.metadata.current_version + 1}</Button>
            </div>
          </div>
        </div>
      )}
    </Drawer>
  );
}