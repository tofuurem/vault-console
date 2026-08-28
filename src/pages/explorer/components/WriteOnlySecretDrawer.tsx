import { useEffect, useState } from 'react';

import { useDeferredSecretJsonValidation } from '@/application/json/useDeferredSecretJsonValidation';
import Button from '@/components/base/Button';
import Drawer from '@/components/base/Drawer';
import type { KvV2WriteStrategy } from '@/domain/vault/kv-v2';
import { normalizeVaultError } from '@/domain/vault/errors';
import { formatSecretJson } from '@/domain/vault/secret-json';
import JsonSecretEditor from './JsonSecretEditor';

interface KeyValuePair {
  readonly id: number;
  readonly key: string;
  readonly value: string;
}

interface WriteOnlySecretDrawerProps {
  readonly open: boolean;
  readonly mount: string;
  readonly path: string | null;
  readonly currentVersion?: number;
  readonly onClose: () => void;
  readonly onSave: (
    data: Readonly<Record<string, unknown>>,
    strategy: KvV2WriteStrategy,
  ) => Promise<void>;
}

let nextPairId = 2;
const initialPairs = (): KeyValuePair[] => [
  { id: 1, key: '', value: '' },
  { id: 2, key: '', value: '' },
];

export default function WriteOnlySecretDrawer({
  open,
  mount,
  path,
  currentVersion,
  onClose,
  onSave,
}: WriteOnlySecretDrawerProps) {
  const [step, setStep] = useState<'edit' | 'review'>('edit');
  const [pairs, setPairs] = useState<KeyValuePair[]>(initialPairs);
  const [rawMode, setRawMode] = useState(false);
  const [rawJson, setRawJson] = useState('{\n  \n}');
  const [unknownStrategy, setUnknownStrategy] = useState<'create-only' | 'unconditional'>('create-only');
  const [replacementAcknowledged, setReplacementAcknowledged] = useState(false);
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [focusErrorSignal, setFocusErrorSignal] = useState(0);
  const [reviewData, setReviewData] = useState<Readonly<Record<string, unknown>>>();
  const rawValidation = useDeferredSecretJsonValidation(rawJson, {
    enabled: open && rawMode && step === 'edit',
  });
  const parsedRawJson = rawValidation.result;
  const strategy: KvV2WriteStrategy = currentVersion === undefined
    ? { type: unknownStrategy }
    : { type: 'check-and-set', version: currentVersion };

  useEffect(() => {
    if (!open) return;
    setStep('edit');
    setPairs(initialPairs());
    setRawMode(false);
    setRawJson('{\n  \n}');
    setUnknownStrategy('create-only');
    setReplacementAcknowledged(false);
    setErrors([]);
    setSaveError('');
    setSaving(false);
    setFocusErrorSignal(0);
    setReviewData(undefined);
  }, [currentVersion, mount, open, path]);

  const requestClose = () => {
    if (!saving) onClose();
  };
  const updatePair = (id: number, field: 'key' | 'value', value: string) => {
    setPairs((current) => current.map((pair) => (
      pair.id === id ? { ...pair, [field]: value } : pair
    )));
  };
  const structuredData = (): Readonly<Record<string, unknown>> => Object.fromEntries(
    pairs
      .filter((pair) => pair.key.trim())
      .map((pair) => [pair.key.trim(), pair.value]),
  );
  const review = () => {
    const nextErrors: string[] = [];
    const exactRawJson = rawMode ? rawValidation.validateNow() : undefined;
    if (exactRawJson?.ok === false) {
      nextErrors.push('Fix the highlighted JSON error before review.');
    } else if (!rawMode) {
      const filled = pairs.filter((pair) => pair.key.trim() || pair.value);
      if (!filled.length) nextErrors.push('Add at least one key/value pair.');
      if (filled.some((pair) => !pair.key.trim())) nextErrors.push('Every value needs a key.');
      const keys = filled.map((pair) => pair.key.trim()).filter(Boolean);
      if (new Set(keys).size !== keys.length) nextErrors.push('Secret keys must be unique.');
    }
    setErrors(nextErrors);
    if (nextErrors.length > 0) {
      if (exactRawJson?.ok === false) setFocusErrorSignal((current) => current + 1);
      return;
    }
    setReviewData(exactRawJson?.ok ? exactRawJson.data : structuredData());
    setReplacementAcknowledged(false);
    setStep('review');
  };
  const save = async () => {
    if (!reviewData) return;
    setSaving(true);
    setSaveError('');
    try {
      await onSave(reviewData, strategy);
      setSaving(false);
      onClose();
    } catch (cause) {
      const error = normalizeVaultError(cause);
      setSaveError(
        error.code === 'conflict'
          ? 'The CAS check failed. Obtain metadata read access and retry with the current version.'
          : error.code === 'invalid-request' && strategy.type === 'unconditional'
            ? 'Vault rejected the write. This key may require CAS; obtain metadata read access to use its current version.'
            : error.message,
      );
      setSaving(false);
    }
  };

  if (!path) return null;

  return (
    <Drawer open={open} onClose={requestClose} title="Write secret without read access" width="600px">
      <div className="space-y-4 p-4">
        <div className="rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-xs leading-5 text-warning-800">
          <p className="font-semibold">Existing fields are unknown.</p>
          <p>This write replaces the complete secret document. Fields you do not provide cannot be preserved.</p>
        </div>

        {(errors.length > 0 || saveError) && (
          <div role="alert" className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-700">
            {errors.map((error) => <p key={error}>{error}</p>)}
            {saveError && <p>{saveError}</p>}
          </div>
        )}

        <div className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-1 rounded-md border border-background-200 bg-background-100/50 p-3 text-xs">
          <span className="text-foreground-500">Target</span>
          <span className="break-all font-mono text-foreground-800">{mount}/{path}</span>
          <span className="text-foreground-500">Read access</span>
          <span className="text-foreground-800">Unavailable</span>
        </div>

        {step === 'edit' ? (
          <>
            <div>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-semibold text-foreground-700">Complete replacement data</h3>
                  <button
                    type="button"
                    onClick={() => setRawMode((current) => !current)}
                    className="rounded border border-background-300 px-1.5 py-0.5 text-[10px] text-foreground-500 hover:text-foreground-800"
                  >
                    {rawMode ? 'Structured fields' : 'Raw JSON'}
                  </button>
                </div>
                {!rawMode && (
                  <button
                    type="button"
                    onClick={() => setPairs((current) => [
                      ...current,
                      { id: ++nextPairId, key: '', value: '' },
                    ])}
                    className="text-xs text-primary-600 hover:text-primary-700"
                  >
                    + Add field
                  </button>
                )}
              </div>
              {rawMode ? (
                <div className="flex min-h-[320px] flex-col">
                  <JsonSecretEditor
                    value={rawJson}
                    onChange={setRawJson}
                    onFormat={() => {
                      const exact = rawValidation.validateNow();
                      if (exact.ok) setRawJson(formatSecretJson(exact.data));
                    }}
                    validationError={parsedRawJson?.ok === false ? parsedRawJson.message : undefined}
                    validationLocation={parsedRawJson?.ok === false ? parsedRawJson.location : undefined}
                    focusErrorSignal={focusErrorSignal}
                    disabled={saving}
                    largeDocument={rawValidation.isLarge}
                    validationPending={rawValidation.status === 'pending'}
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  {pairs.map((pair) => (
                    <div
                      key={pair.id}
                      data-testid="write-only-field-row"
                      className="grid min-w-0 grid-cols-[minmax(0,1fr)_44px] gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_32px]"
                    >
                      <input
                        aria-label="Secret key"
                        value={pair.key}
                        onChange={(event) => updatePair(pair.id, 'key', event.target.value)}
                        placeholder="KEY"
                        className="col-span-2 h-11 min-w-0 w-full rounded-md border border-background-300 bg-background-50 px-2 font-mono text-xs focus:border-primary-400 focus:outline-none sm:col-span-1 sm:h-8"
                      />
                      <input
                        aria-label={`Value for ${pair.key || 'new key'}`}
                        value={pair.value}
                        onChange={(event) => updatePair(pair.id, 'value', event.target.value)}
                        placeholder="value"
                        className="h-11 min-w-0 w-full rounded-md border border-background-300 bg-background-50 px-2 font-mono text-xs focus:border-primary-400 focus:outline-none sm:h-8"
                      />
                      <button
                        type="button"
                        aria-label="Remove field"
                        disabled={pairs.length === 1}
                        onClick={() => setPairs((current) => current.filter((candidate) => candidate.id !== pair.id))}
                        className="flex h-11 w-11 items-center justify-center rounded-md text-foreground-400 hover:bg-danger-50 hover:text-danger-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger-400 disabled:opacity-30 sm:h-8 sm:w-8"
                      >
                        <i className="ri-close-line" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {currentVersion === undefined ? (
              <fieldset className="space-y-2 rounded-md border border-background-200 p-3">
                <legend className="px-1 text-xs font-semibold text-foreground-700">Write strategy</legend>
                <label className="flex cursor-pointer items-start gap-2 text-xs text-foreground-700">
                  <input
                    type="radio"
                    name="write-only-strategy"
                    value="create-only"
                    checked={unknownStrategy === 'create-only'}
                    onChange={() => setUnknownStrategy('create-only')}
                  />
                  <span><strong>Create only (CAS 0)</strong><span className="mt-0.5 block text-[11px] text-foreground-500">Fails safely if this secret already exists.</span></span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 text-xs text-foreground-700">
                  <input
                    type="radio"
                    name="write-only-strategy"
                    value="unconditional"
                    checked={unknownStrategy === 'unconditional'}
                    onChange={() => setUnknownStrategy('unconditional')}
                  />
                  <span><strong>Write without CAS</strong><span className="mt-0.5 block text-[11px] text-danger-600">Can replace an existing secret without detecting concurrent changes.</span></span>
                </label>
              </fieldset>
            ) : (
              <div className="rounded-md border border-success-200 bg-success-50 px-3 py-2 text-[11px] leading-5 text-success-700">
                Metadata is readable. Check-and-set is fixed to current version {currentVersion}.
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button size="sm" onClick={requestClose}>Cancel</Button>
              <Button size="sm" variant="primary" onClick={review}>Review write</Button>
            </div>
          </>
        ) : (
          <>
            <div>
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.15em] text-warning-700">
                {strategy.type === 'check-and-set'
                  ? `Check-and-set version ${strategy.version}`
                  : strategy.type === 'create-only'
                    ? 'Create only · CAS 0'
                    : 'No CAS · replacement allowed'}
              </p>
              <h3 className="mt-1 text-sm font-semibold text-foreground-900">Confirm complete secret write</h3>
            </div>
            <dl className="space-y-2 rounded-md border border-background-200 bg-background-100/60 p-3 text-xs">
              <div className="flex justify-between gap-4"><dt className="text-foreground-500">Target path</dt><dd className="break-all text-right font-mono text-foreground-800">{mount}/{path}</dd></div>
              <div className="flex justify-between"><dt className="text-foreground-500">Submitted keys</dt><dd className="font-mono text-foreground-800">{Object.keys(reviewData ?? {}).length}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-foreground-500">Concurrency guard</dt><dd className="text-right font-medium text-foreground-800">{strategy.type === 'check-and-set' ? `CAS ${strategy.version}` : strategy.type === 'create-only' ? 'CAS 0' : 'None'}</dd></div>
            </dl>
            <p className="text-[11px] leading-5 text-foreground-500">Values stay hidden during review and are sent directly to Vault.</p>
            {strategy.type === 'unconditional' && (
              <label className="flex cursor-pointer items-start gap-2 rounded-md border border-danger-200 bg-danger-50 p-3 text-xs text-danger-700">
                <input
                  type="checkbox"
                  checked={replacementAcknowledged}
                  onChange={(event) => setReplacementAcknowledged(event.target.checked)}
                />
                <span>I understand that this can replace an existing secret without checking its current version.</span>
              </label>
            )}
            <div className="flex justify-between gap-2">
              <Button size="sm" onClick={() => setStep('edit')} disabled={saving}>Back</Button>
              <div className="flex gap-2">
                <Button size="sm" onClick={requestClose} disabled={saving}>Cancel</Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => void save()}
                  loading={saving}
                  disabled={strategy.type === 'unconditional' && !replacementAcknowledged}
                >
                  Write complete secret
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
}
