import { useState } from 'react';
import Drawer from '@/components/base/Drawer';
import Button from '@/components/base/Button';
import { Textarea } from '@/components/base/Input';

interface KeyValuePair {
  id: string;
  key: string;
  value: string;
}

interface CreateSecretDrawerProps {
  open: boolean;
  onClose: () => void;
  mount: string;
  currentPath: string;
  onSave: (name: string, data: Record<string, string>) => void;
}

let pairId = 0;
function nextId() {
  pairId += 1;
  return `kv-${pairId}`;
}

export default function CreateSecretDrawer({ open, onClose, mount, currentPath, onSave }: CreateSecretDrawerProps) {
  const [step, setStep] = useState<'edit' | 'review'>('edit');
  const [secretName, setSecretName] = useState('');
  const [pairs, setPairs] = useState<KeyValuePair[]>([
    { id: nextId(), key: '', value: '' },
    { id: nextId(), key: '', value: '' },
  ]);
  const [rawJsonMode, setRawJsonMode] = useState(false);
  const [rawJson, setRawJson] = useState('{\n  \n}');
  const [customMeta, setCustomMeta] = useState<KeyValuePair[]>([]);
  const [showMeta, setShowMeta] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const fullPath = `${currentPath}${secretName}`;

  const addPair = () => {
    setPairs([...pairs, { id: nextId(), key: '', value: '' }]);
  };

  const removePair = (id: string) => {
    if (pairs.length <= 1) return;
    setPairs(pairs.filter((p) => p.id !== id));
  };

  const updatePair = (id: string, field: 'key' | 'value', val: string) => {
    setPairs(pairs.map((p) => (p.id === id ? { ...p, [field]: val } : p)));
  };

  const addMetaPair = () => {
    setCustomMeta([...customMeta, { id: nextId(), key: '', value: '' }]);
  };

  const removeMetaPair = (id: string) => {
    setCustomMeta(customMeta.filter((p) => p.id !== id));
  };

  const updateMetaPair = (id: string, field: 'key' | 'value', val: string) => {
    setCustomMeta(customMeta.map((p) => (p.id === id ? { ...p, [field]: val } : p)));
  };

  const validate = (): boolean => {
    const errs: string[] = [];
    if (!secretName.trim()) {
      errs.push('Secret name is required');
    } else if (!/^[a-zA-Z0-9._-]+$/.test(secretName)) {
      errs.push('Secret name contains invalid characters');
    }

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
      if (filledPairs.some((p) => !p.key.trim() && p.value.trim())) {
        errs.push('All values must have a key');
      }
    } else {
      try {
        const parsed = JSON.parse(rawJson);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          errs.push('JSON must be a valid object');
        }
      } catch {
        errs.push('Invalid JSON');
      }
    }

    setErrors(errs);
    return errs.length === 0;
  };

  const handleNext = () => {
    if (validate()) {
      setStep('review');
    }
  };

  const getFinalData = (): Record<string, string> => {
    if (rawJsonMode) {
      return JSON.parse(rawJson);
    }
    const data: Record<string, string> = {};
    pairs
      .filter((p) => p.key.trim())
      .forEach((p) => {
        data[p.key.trim()] = p.value;
      });
    return data;
  };

  const getAddedKeys = (): string[] => {
    return Object.keys(getFinalData());
  };

  const handleSave = () => {
    onSave(secretName.trim(), getFinalData());
    reset();
    onClose();
  };

  const reset = () => {
    setStep('edit');
    setSecretName('');
    setPairs([
      { id: nextId(), key: '', value: '' },
      { id: nextId(), key: '', value: '' },
    ]);
    setRawJson('{\n  \n}');
    setCustomMeta([]);
    setShowMeta(false);
    setErrors([]);
    setRawJsonMode(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Drawer open={open} onClose={handleClose} title="Create Secret" width="560px">
      {step === 'edit' && (
        <div className="p-4 space-y-4">
          {errors.length > 0 && (
            <div className="px-3 py-2 rounded-md bg-red-50 border border-red-200 space-y-0.5">
              {errors.map((e, i) => (
                <div key={i} className="text-xs text-red-700 flex items-center gap-1.5">
                  <i className="ri-error-warning-line text-sm shrink-0" />
                  {e}
                </div>
              ))}
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-foreground-500 shrink-0">Mount</span>
              <span className="font-mono text-foreground-800 bg-background-100 px-1.5 py-0.5 rounded">{mount}</span>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-foreground-500 shrink-0">Folder</span>
              <span className="font-mono text-foreground-800 bg-background-100 px-1.5 py-0.5 rounded">{currentPath}</span>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground-700">Secret name</label>
              <input
                type="text"
                value={secretName}
                onChange={(e) => setSecretName(e.target.value)}
                placeholder="e.g. database, api-keys"
                className="w-full h-8 mt-1 px-2.5 text-sm font-mono rounded-md border border-background-300 bg-background-50 text-foreground-900 focus:outline-none focus:border-primary-400"
              />
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-foreground-500">Full path</span>
              <span className="font-mono text-foreground-800 break-all">{fullPath || currentPath}</span>
            </div>
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
                  <i className="ri-add-line text-sm" />
                  Add field
                </button>
              )}
            </div>

            {rawJsonMode ? (
              <Textarea
                value={rawJson}
                onChange={(e) => setRawJson(e.target.value)}
                rows={10}
                monospace
                className="text-xs"
              />
            ) : (
              <div className="space-y-1.5">
                <div className="grid grid-cols-[1fr_1fr_32px] gap-2 text-[11px] font-medium text-foreground-500 px-1">
                  <span>Key</span>
                  <span>Value</span>
                  <span />
                </div>
                {pairs.map((pair, idx) => (
                  <div key={pair.id} className="grid grid-cols-[1fr_1fr_32px] gap-2">
                    <input
                      type="text"
                      value={pair.key}
                      onChange={(e) => updatePair(pair.id, 'key', e.target.value)}
                      placeholder="KEY_NAME"
                      className="h-8 px-2 text-xs font-mono rounded-md border border-background-300 bg-background-50 text-foreground-900 focus:outline-none focus:border-primary-400"
                    />
                    <div className="relative">
                      <input
                        type="text"
                        value={pair.value}
                        onChange={(e) => updatePair(pair.id, 'value', e.target.value)}
                        placeholder="value"
                        className="w-full h-8 px-2 pr-8 text-xs font-mono rounded-md border border-background-300 bg-background-50 text-foreground-900 focus:outline-none focus:border-primary-400"
                      />
                      {pair.value.length > 40 && (
                        <button className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded text-foreground-400 hover:text-foreground-700 cursor-pointer">
                          <i className="ri-fullscreen-line text-xs" />
                        </button>
                      )}
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

          <div className="border-t border-background-200 pt-3">
            <button
              onClick={() => setShowMeta(!showMeta)}
              className="text-xs text-foreground-500 hover:text-foreground-700 cursor-pointer flex items-center gap-1"
            >
              <i className={showMeta ? 'ri-arrow-down-s-line text-sm' : 'ri-arrow-right-s-line text-sm'} />
              Custom metadata {showMeta ? '' : '(optional)'}
            </button>
            {showMeta && (
              <div className="mt-2 space-y-1.5">
                {customMeta.map((pair) => (
                  <div key={pair.id} className="grid grid-cols-[1fr_1fr_32px] gap-2">
                    <input
                      type="text"
                      value={pair.key}
                      onChange={(e) => updateMetaPair(pair.id, 'key', e.target.value)}
                      placeholder="key"
                      className="h-7 px-2 text-xs font-mono rounded border border-background-300 bg-background-50 focus:outline-none focus:border-primary-400"
                    />
                    <input
                      type="text"
                      value={pair.value}
                      onChange={(e) => updateMetaPair(pair.id, 'value', e.target.value)}
                      placeholder="value"
                      className="h-7 px-2 text-xs font-mono rounded border border-background-300 bg-background-50 focus:outline-none focus:border-primary-400"
                    />
                    <button
                      onClick={() => removeMetaPair(pair.id)}
                      className="w-7 h-7 flex items-center justify-center rounded text-foreground-400 hover:text-red-500 cursor-pointer"
                    >
                      <i className="ri-close-line text-xs" />
                    </button>
                  </div>
                ))}
                <button onClick={addMetaPair} className="text-xs text-primary-600 hover:text-primary-700 cursor-pointer">
                  + Add metadata
                </button>
              </div>
            )}
          </div>

          <div className="px-3 py-2 rounded-md bg-amber-50 border border-amber-200">
            <p className="text-[11px] text-amber-700">
              Secret values cannot be recovered from the UI after leaving this page unless you have read permission on the path.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={handleClose}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={handleNext}>Review &amp; save</Button>
          </div>
        </div>
      )}

      {step === 'review' && (
        <div className="p-4 space-y-4">
          <div>
            <span className="text-[11px] font-semibold text-foreground-500 uppercase tracking-wider">Review Summary</span>
            <div className="mt-3 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-foreground-500">Target path</span>
                <span className="font-mono text-foreground-800">{fullPath}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-foreground-500">Keys being added</span>
                <span className="font-mono text-foreground-800">{getAddedKeys().length} keys</span>
              </div>
              <div className="mt-1 space-y-0.5">
                {getAddedKeys().map((k) => (
                  <div key={k} className="text-xs font-mono text-foreground-600 pl-2 border-l-2 border-emerald-400">
                    + {k}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="px-3 py-2 rounded-md bg-amber-50 border border-amber-200">
            <p className="text-[11px] text-amber-700">
              This will create a new secret at version 1. Secret values cannot be viewed after creation is complete unless you have read permission.
            </p>
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button variant="secondary" size="sm" onClick={() => setStep('edit')}>
              <i className="ri-arrow-left-line" />
              Back to edit
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={handleClose}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={handleSave}>Create secret</Button>
            </div>
          </div>
        </div>
      )}
    </Drawer>
  );
}