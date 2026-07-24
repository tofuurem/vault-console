import { useMemo, useState } from 'react';

import Button from '@/components/base/Button';
import Drawer from '@/components/base/Drawer';
import { Input } from '@/components/base/Input';
import { normalizeVaultError } from '@/domain/vault/errors';
import { formatSecretJson, parseSecretJson } from '@/domain/vault/secret-json';
import JsonSecretEditor from './JsonSecretEditor';

interface KeyValuePair {
  readonly id: number;
  readonly key: string;
  readonly value: string;
}

interface CreateSecretDrawerProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly mount: string;
  readonly currentPath: string;
  readonly onSave: (name: string, data: Readonly<Record<string, unknown>>) => Promise<void>;
}

let nextPairId = 2;
const initialPairs = (): KeyValuePair[] => [
  { id: 1, key: '', value: '' },
  { id: 2, key: '', value: '' },
];

export default function CreateSecretDrawer({ open, onClose, mount, currentPath, onSave }: CreateSecretDrawerProps) {
  const [step, setStep] = useState<'edit' | 'review'>('edit');
  const [name, setName] = useState('');
  const [pairs, setPairs] = useState<KeyValuePair[]>(initialPairs);
  const [rawMode, setRawMode] = useState(false);
  const [rawJson, setRawJson] = useState('{\n  \n}');
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [focusErrorSignal, setFocusErrorSignal] = useState(0);
  const logicalPath = `${currentPath}${name.trim()}`;
  const fullPath = `${mount}/${logicalPath}`;
  const parsedRawJson = useMemo(() => parseSecretJson(rawJson), [rawJson]);

  const reset = () => {
    setStep('edit');
    setName('');
    setPairs(initialPairs());
    setRawMode(false);
    setRawJson('{\n  \n}');
    setErrors([]);
    setSaveError('');
    setSaving(false);
    setFocusErrorSignal(0);
  };
  const close = () => {
    reset();
    onClose();
  };
  const updatePair = (id: number, field: 'key' | 'value', value: string) => {
    setPairs((current) => current.map((pair) => pair.id === id ? { ...pair, [field]: value } : pair));
  };
  const data = (): Readonly<Record<string, unknown>> => {
    if (rawMode) return parsedRawJson.ok ? parsedRawJson.data : {};
    return Object.fromEntries(pairs.filter((pair) => pair.key.trim()).map((pair) => [pair.key.trim(), pair.value]));
  };
  const validate = () => {
    const nextErrors: string[] = [];
    if (!name.trim()) nextErrors.push('Secret name is required.');
    else if (!/^[a-zA-Z0-9._-]+$/.test(name.trim())) nextErrors.push('Use letters, numbers, dots, underscores, or hyphens in the name.');
    if (rawMode && !parsedRawJson.ok) {
      nextErrors.push('Fix the highlighted JSON error before review.');
    } else if (!rawMode) {
      const filled = pairs.filter((pair) => pair.key.trim() || pair.value);
      if (!filled.length) nextErrors.push('Add at least one key/value pair.');
      if (filled.some((pair) => !pair.key.trim())) nextErrors.push('Every value needs a key.');
      const keys = filled.map((pair) => pair.key.trim()).filter(Boolean);
      if (new Set(keys).size !== keys.length) nextErrors.push('Secret keys must be unique.');
    }
    setErrors(nextErrors);
    return nextErrors.length === 0;
  };
  const save = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await onSave(name.trim(), data());
      close();
    } catch (cause) {
      const error = normalizeVaultError(cause);
      setSaveError(error.code === 'authorization'
        ? 'Your Vault policy cannot create this secret at the selected path.'
        : error.message);
      setSaving(false);
    }
  };

  return (
    <Drawer open={open} onClose={close} title="Create secret" width="560px">
      <div className="space-y-4 p-4">
        {(errors.length > 0 || saveError) && (
          <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {errors.map((error) => <p key={error}>{error}</p>)}
            {saveError && <p>{saveError}</p>}
          </div>
        )}

        {step === 'edit' ? (
          <>
            <div className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-1 rounded-md border border-background-200 bg-background-100/50 p-3 text-xs">
              <span className="text-foreground-500">Mount</span><span className="font-mono text-foreground-800">{mount}/</span>
              <span className="text-foreground-500">Folder</span><span className="break-all font-mono text-foreground-800">{currentPath || '/'}</span>
            </div>
            <Input label="Secret name" value={name} onChange={(event) => setName(event.target.value)} placeholder="database" monospace autoFocus />
            <p className="break-all text-[11px] text-foreground-500">Target: <span className="font-mono text-foreground-800">{fullPath}</span></p>

            <div className="border-t border-background-200 pt-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2"><h3 className="text-xs font-semibold text-foreground-700">Secret data</h3><button type="button" onClick={() => setRawMode((current) => !current)} className="rounded border border-background-300 px-1.5 py-0.5 text-[10px] text-foreground-500 hover:text-foreground-800">{rawMode ? 'Structured fields' : 'Raw JSON'}</button></div>
                {!rawMode && <button type="button" onClick={() => setPairs((current) => [...current, { id: ++nextPairId, key: '', value: '' }])} className="text-xs text-primary-600 hover:text-primary-700">+ Add field</button>}
              </div>
              {rawMode ? (
                <div className="flex min-h-[340px] flex-col">
                  <JsonSecretEditor
                    value={rawJson}
                    onChange={setRawJson}
                    onFormat={() => {
                      if (parsedRawJson.ok) setRawJson(formatSecretJson(parsedRawJson.data));
                    }}
                    validationError={parsedRawJson.ok === false ? parsedRawJson.message : undefined}
                    validationLocation={parsedRawJson.ok === false ? parsedRawJson.location : undefined}
                    focusErrorSignal={focusErrorSignal}
                    disabled={saving}
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  {pairs.map((pair) => (
                    <div key={pair.id} className="grid grid-cols-[1fr_1fr_32px] gap-2">
                      <input aria-label="Secret key" value={pair.key} onChange={(event) => updatePair(pair.id, 'key', event.target.value)} placeholder="KEY" className="h-8 rounded-md border border-background-300 bg-background-50 px-2 font-mono text-xs focus:outline-none focus:border-primary-400" />
                      <input aria-label={`Value for ${pair.key || 'new key'}`} value={pair.value} onChange={(event) => updatePair(pair.id, 'value', event.target.value)} placeholder="value" className="h-8 rounded-md border border-background-300 bg-background-50 px-2 font-mono text-xs focus:outline-none focus:border-primary-400" />
                      <button type="button" aria-label="Remove field" disabled={pairs.length === 1} onClick={() => setPairs((current) => current.filter((candidate) => candidate.id !== pair.id))} className="flex h-8 w-8 items-center justify-center rounded-md text-foreground-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"><i className="ri-close-line" aria-hidden="true" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="rounded-md border border-background-200 bg-background-100 px-3 py-2 text-[11px] leading-5 text-foreground-500">Creation uses CAS 0, so Vault will reject the request if a secret already exists at this path.</div>
            <div className="flex justify-end gap-2"><Button size="sm" onClick={close}>Cancel</Button><Button size="sm" variant="primary" onClick={() => {
              if (validate()) setStep('review');
              else if (rawMode && !parsedRawJson.ok) setFocusErrorSignal((current) => current + 1);
            }}>Review &amp; create</Button></div>
          </>
        ) : (
          <>
            <div><p className="font-mono text-[9px] font-semibold uppercase tracking-[0.15em] text-primary-600">Create with CAS 0</p><h3 className="mt-1 text-sm font-semibold text-foreground-900">Confirm new secret</h3></div>
            <dl className="space-y-2 rounded-md border border-background-200 bg-background-100/60 p-3 text-xs">
              <div className="flex justify-between gap-4"><dt className="text-foreground-500">Target path</dt><dd className="break-all text-right font-mono text-foreground-800">{fullPath}</dd></div>
              <div className="flex justify-between"><dt className="text-foreground-500">Keys</dt><dd className="font-mono text-foreground-800">{Object.keys(data()).length}</dd></div>
            </dl>
            <p className="text-[11px] leading-5 text-foreground-500">Values are intentionally hidden from review and are sent directly to Vault.</p>
            <div className="flex justify-between gap-2"><Button size="sm" onClick={() => setStep('edit')} disabled={saving}>Back</Button><div className="flex gap-2"><Button size="sm" onClick={close} disabled={saving}>Cancel</Button><Button size="sm" variant="primary" onClick={() => void save()} loading={saving}>Create secret</Button></div></div>
          </>
        )}
      </div>
    </Drawer>
  );
}
