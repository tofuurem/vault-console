import { useState } from 'react';
import Modal from '@/components/base/Modal';
import Button from '@/components/base/Button';
import Badge from '@/components/base/Badge';
import Tooltip from '@/components/base/Tooltip';
import type { VaultSecret, VaultVersion } from '@/mocks/vault';

interface VersionComparisonProps {
  open: boolean;
  onClose: () => void;
  secret: VaultSecret | null;
  onRestore: (secret: VaultSecret, version: number) => void;
}

function MaskedDiffValue({ value, side }: { value: string; side: 'left' | 'right' }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="flex items-start gap-1 group">
      <span className={`flex-1 text-xs break-all ${revealed ? 'font-mono text-foreground-800' : 'text-foreground-400 select-none'}`}>
        {revealed ? value : '•'.repeat(Math.min(value.length, 20))}
      </span>
      <button
        onClick={() => setRevealed(!revealed)}
        className="w-4 h-4 flex items-center justify-center rounded text-foreground-400 hover:text-foreground-700 cursor-pointer shrink-0 opacity-0 group-hover:opacity-100"
      >
        <i className={`${revealed ? 'ri-eye-off-line' : 'ri-eye-line'} text-[10px]`} />
      </button>
    </div>
  );
}

export default function VersionComparison({ open, onClose, secret, onRestore }: VersionComparisonProps) {
  const [leftVersion, setLeftVersion] = useState<number | null>(null);
  const [rightVersion, setRightVersion] = useState<number | null>(null);

  if (!secret) return null;

  const versions = secret.versions.filter((v) => v.state !== 'destroyed');

  if (!leftVersion && versions.length >= 2) {
    setTimeout(() => {
      setLeftVersion(versions[1].version);
      setRightVersion(versions[0].version);
    }, 0);
  }

  const left = versions.find((v) => v.version === leftVersion);
  const right = versions.find((v) => v.version === rightVersion);

  const allKeys = new Set<string>();
  if (left) Object.keys(left.data).forEach((k) => allKeys.add(k));
  if (right) Object.keys(right.data).forEach((k) => allKeys.add(k));
  const keys = Array.from(allKeys);

  const getKeyStatus = (key: string): 'added' | 'removed' | 'changed' | 'unchanged' => {
    const inLeft = left ? key in left.data : false;
    const inRight = right ? key in right.data : false;
    if (!inLeft && inRight) return 'added';
    if (inLeft && !inRight) return 'removed';
    if (inLeft && inRight && left!.data[key] !== right!.data[key]) return 'changed';
    return 'unchanged';
  };

  const statusColors: Record<string, string> = {
    added: 'bg-emerald-50 border-l-2 border-emerald-400',
    removed: 'bg-red-50 border-l-2 border-red-400',
    changed: 'bg-amber-50 border-l-2 border-amber-400',
    unchanged: '',
  };

  return (
    <Modal open={open} onClose={onClose} title="Version Comparison" width="xl">
      <div className="p-4 space-y-4">
        <div className="text-xs text-foreground-500">
          Comparing versions of <span className="font-mono text-foreground-800">{secret.path}</span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[11px] font-medium text-foreground-500">Version A (older)</label>
            <select
              value={leftVersion || ''}
              onChange={(e) => setLeftVersion(Number(e.target.value))}
              className="w-full h-8 mt-1 px-2 text-xs font-mono rounded-md border border-background-300 bg-background-50 text-foreground-900 focus:outline-none focus:border-primary-400 cursor-pointer"
            >
              {versions.map((v) => (
                <option key={v.version} value={v.version}>v{v.version} - {v.state}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium text-foreground-500">Version B (newer)</label>
            <select
              value={rightVersion || ''}
              onChange={(e) => setRightVersion(Number(e.target.value))}
              className="w-full h-8 mt-1 px-2 text-xs font-mono rounded-md border border-background-300 bg-background-50 text-foreground-900 focus:outline-none focus:border-primary-400 cursor-pointer"
            >
              {versions.map((v) => (
                <option key={v.version} value={v.version}>v{v.version} - {v.state}</option>
              ))}
            </select>
          </div>
        </div>

        {left && right && (
          <div className="border border-background-200 rounded-md overflow-hidden">
            <div className="grid grid-cols-[140px_1fr_1fr] bg-background-100 px-3 py-2 border-b border-background-200 text-[11px] font-semibold text-foreground-500 uppercase tracking-wider">
              <span>Key</span>
              <span>v{left.version} ({left.state})</span>
              <span>v{right.version} ({right.state})</span>
            </div>
            <div className="divide-y divide-background-100">
              {keys.map((key) => {
                const status = getKeyStatus(key);
                return (
                  <div key={key} className={`grid grid-cols-[140px_1fr_1fr] px-3 py-1.5 ${statusColors[status]}`}>
                    <span className={`text-xs font-mono font-medium ${
                      status === 'added' ? 'text-emerald-700' :
                      status === 'removed' ? 'text-red-700' :
                      status === 'changed' ? 'text-amber-700' :
                      'text-foreground-700'
                    }`}>
                      {key}
                    </span>
                    <div className="pr-2">
                      {status !== 'added' && <MaskedDiffValue value={left.data[key] || ''} side="left" />}
                      {status === 'added' && <span className="text-xs text-foreground-400 italic">—</span>}
                    </div>
                    <div>
                      {status !== 'removed' && <MaskedDiffValue value={right.data[key] || ''} side="right" />}
                      {status === 'removed' && <span className="text-xs text-foreground-400 italic">—</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 text-xs text-foreground-500">
          <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-emerald-400 rounded" />Added</span>
          <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-red-400 rounded" />Removed</span>
          <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-amber-400 rounded" />Changed</span>
        </div>

        <div className="px-3 py-2 rounded-md bg-background-100 border border-background-200 text-xs text-foreground-600">
          Restoration creates a new version instead of rewriting history. The old versions remain accessible.
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
          {right && (
            <Tooltip content={`Create a new version from v${right.version}`}>
              <Button variant="primary" size="sm" onClick={() => { onRestore(secret, right.version); onClose(); }}>
                <i className="ri-arrow-go-back-line text-sm" />
                Restore v{right.version}
              </Button>
            </Tooltip>
          )}
        </div>
      </div>
    </Modal>
  );
}