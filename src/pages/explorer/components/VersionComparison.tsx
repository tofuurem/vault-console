import { useEffect, useMemo, useState } from 'react';

import Button from '@/components/base/Button';
import Modal from '@/components/base/Modal';
import type { KvV2Secret, KvV2SecretHistory } from '@/domain/vault/contracts';
import { normalizeVaultError } from '@/domain/vault/errors';

interface VersionComparisonProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly mount: string;
  readonly path: string | null;
  readonly history?: KvV2SecretHistory;
  readonly currentSecret?: KvV2Secret;
  readonly loadVersion: (version: number) => Promise<KvV2Secret>;
  readonly onRestore: (version: number, data: Readonly<Record<string, unknown>>) => Promise<void>;
}

function printable(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value) ?? String(value);
}

function DiffValue({ value }: { value: unknown }) {
  const [revealed, setRevealed] = useState(false);
  const text = printable(value);
  return (
    <div className="group flex items-start gap-1">
      <span className={`min-w-0 flex-1 break-all font-mono text-xs ${revealed ? 'text-foreground-800' : 'select-none text-foreground-400'}`}>{revealed ? text : '•'.repeat(Math.min(Math.max(text.length, 6), 18))}</span>
      <button type="button" aria-label={revealed ? 'Hide comparison value' : 'Reveal comparison value'} onClick={() => setRevealed((current) => !current)} className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-foreground-400 opacity-0 group-hover:opacity-100 focus:opacity-100"><i className={`${revealed ? 'ri-eye-off-line' : 'ri-eye-line'} text-[10px]`} aria-hidden="true" /></button>
    </div>
  );
}

export default function VersionComparison({
  open,
  onClose,
  mount,
  path,
  history,
  currentSecret,
  loadVersion,
  onRestore,
}: VersionComparisonProps) {
  const readableVersions = useMemo(() => history?.versions.filter((version) => !version.destroyed && !version.deletionTime) ?? [], [history]);
  const [leftVersion, setLeftVersion] = useState<number>();
  const [rightVersion, setRightVersion] = useState<number>();
  const [loaded, setLoaded] = useState<Readonly<Record<number, KvV2Secret>>>({});
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !history) return;
    setLeftVersion(readableVersions[1]?.version ?? readableVersions[0]?.version);
    setRightVersion(readableVersions[0]?.version);
    setLoaded(currentSecret ? { [currentSecret.metadata.version]: currentSecret } : {});
    setError('');
  }, [currentSecret, history, open, readableVersions]);

  useEffect(() => {
    if (!open) return;
    const missing = [leftVersion, rightVersion].filter((version): version is number => Boolean(version && !loaded[version]));
    if (!missing.length) return;
    let active = true;
    setLoading(true);
    Promise.all(missing.map(async (version) => [version, await loadVersion(version)] as const)).then(
      (versions) => {
        if (!active) return;
        setLoaded((current) => ({ ...current, ...Object.fromEntries(versions) }));
        setLoading(false);
      },
      (cause) => {
        if (!active) return;
        setError(normalizeVaultError(cause).message);
        setLoading(false);
      },
    );
    return () => { active = false; };
  }, [leftVersion, loadVersion, loaded, open, rightVersion]);

  if (!path || !history) return null;
  const left = leftVersion ? loaded[leftVersion] : undefined;
  const right = rightVersion ? loaded[rightVersion] : undefined;
  const keys = Array.from(new Set([...Object.keys(left?.data ?? {}), ...Object.keys(right?.data ?? {})])).sort();
  const restore = async () => {
    if (!rightVersion || !right) return;
    setRestoring(true);
    setError('');
    try {
      await onRestore(rightVersion, right.data);
      setRestoring(false);
      onClose();
    } catch (cause) {
      setError(normalizeVaultError(cause).message);
      setRestoring(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Compare and restore versions" width="xl">
      <div className="space-y-4 p-4">
        <p className="text-xs text-foreground-500">Comparing <span className="font-mono text-foreground-800">{mount}/{path}</span></p>
        {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
        {readableVersions.length < 2 ? (
          <div className="rounded-md border border-background-200 bg-background-100 p-4 text-xs text-foreground-500">At least two readable versions are required for comparison.</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <label className="text-[11px] font-medium text-foreground-500">Version A<select aria-label="Version A" value={leftVersion ?? ''} onChange={(event) => setLeftVersion(Number(event.target.value))} className="mt-1 h-8 w-full rounded-md border border-background-300 bg-background-50 px-2 font-mono text-xs text-foreground-900">{readableVersions.map((version) => <option key={version.version} value={version.version}>v{version.version}</option>)}</select></label>
              <label className="text-[11px] font-medium text-foreground-500">Version B<select aria-label="Version B" value={rightVersion ?? ''} onChange={(event) => setRightVersion(Number(event.target.value))} className="mt-1 h-8 w-full rounded-md border border-background-300 bg-background-50 px-2 font-mono text-xs text-foreground-900">{readableVersions.map((version) => <option key={version.version} value={version.version}>v{version.version}</option>)}</select></label>
            </div>
            {loading ? <div className="h-28 animate-pulse rounded-md bg-background-100" aria-label="Loading versions" /> : left && right && (
              <div className="overflow-hidden rounded-md border border-background-200">
                <div className="grid grid-cols-[130px_1fr_1fr] border-b border-background-200 bg-background-100 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-foreground-500"><span>Key</span><span>v{left.metadata.version}</span><span>v{right.metadata.version}</span></div>
                <div className="divide-y divide-background-100">{keys.map((key) => {
                  const leftHas = key in left.data;
                  const rightHas = key in right.data;
                  const changed = JSON.stringify(left.data[key]) !== JSON.stringify(right.data[key]);
                  return <div key={key} className={`grid grid-cols-[130px_1fr_1fr] px-3 py-2 ${changed ? 'border-l-2 border-amber-400 bg-amber-50/60' : ''}`}><span className="break-all pr-2 font-mono text-xs font-medium text-foreground-700">{key}</span><div className="pr-2">{leftHas ? <DiffValue value={left.data[key]} /> : <span className="text-xs text-foreground-400">—</span>}</div><div>{rightHas ? <DiffValue value={right.data[key]} /> : <span className="text-xs text-foreground-400">—</span>}</div></div>;
                })}</div>
              </div>
            )}
          </>
        )}
        <div className="rounded-md border border-background-200 bg-background-100 px-3 py-2 text-[11px] leading-5 text-foreground-500">Restore never rewrites history. It writes the selected data as a new version with CAS {history.currentVersion}.</div>
        <div className="flex justify-end gap-2"><Button size="sm" onClick={onClose} disabled={restoring}>Close</Button>{right && <Button size="sm" variant="primary" onClick={() => void restore()} loading={restoring}><i className="ri-arrow-go-back-line" aria-hidden="true" /> Restore v{right.metadata.version}</Button>}</div>
      </div>
    </Modal>
  );
}
