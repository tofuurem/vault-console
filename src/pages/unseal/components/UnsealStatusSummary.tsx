import { unsealPhase, type UnsealPhase, type VaultSealStatus } from '@/domain/vault/seal';

const PHASE_CONTENT: Readonly<Record<UnsealPhase, { dot: string; title: string }>> = {
  uninitialized: { dot: 'bg-danger-500', title: 'Vault is not initialized' },
  unsealed: { dot: 'bg-success-500', title: 'Vault is unsealed' },
  'auto-unseal': { dot: 'bg-warning-500', title: 'Waiting for auto-unseal' },
  'awaiting-shares': { dot: 'bg-warning-500', title: 'Vault is sealed' },
};

interface UnsealStatusSummaryProps {
  readonly status?: VaultSealStatus;
  readonly loading: boolean;
  readonly unavailable: boolean;
}

function sealDescription(status: VaultSealStatus): string {
  if (status.type === 'auto') return status.recoverySeal ? 'Auto-unseal · recovery keys' : 'Auto-unseal';
  return `Shamir · ${status.threshold} of ${status.shares}`;
}

export default function UnsealStatusSummary({ status, loading, unavailable }: UnsealStatusSummaryProps) {
  const content = status
    ? PHASE_CONTENT[unsealPhase(status)]
    : unavailable
      ? { dot: 'bg-danger-500', title: 'Vault is unavailable' }
      : { dot: 'bg-warning-400 animate-pulse motion-reduce:animate-none', title: 'Checking Vault…' };

  return (
    <div className="border-b border-background-200 px-6 py-3" aria-live="polite" aria-busy={loading}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${content.dot}`} aria-hidden="true" />
        <span className="font-medium text-foreground-700">{content.title}</span>
        {status?.version && <span className="font-mono text-foreground-400">v{status.version}</span>}
        {status?.initialized && (
          <span className="ml-auto text-foreground-500">{sealDescription(status)}</span>
        )}
      </div>
    </div>
  );
}
