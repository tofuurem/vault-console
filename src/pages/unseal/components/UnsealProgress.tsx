import { remainingShares, type VaultSealStatus } from '@/domain/vault/seal';

interface UnsealProgressProps {
  readonly status: VaultSealStatus;
}

export default function UnsealProgress({ status }: UnsealProgressProps) {
  const remaining = remainingShares(status);
  const segments = Array.from({ length: Math.max(1, status.threshold) }, (_, index) => index < status.progress);
  const label = `${status.progress} of ${status.threshold} key shares accepted`;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-medium text-foreground-800">{label}</p>
        <p className="shrink-0 text-[11px] text-foreground-500">
          {remaining === 1 ? '1 more required' : `${remaining} more required`}
        </p>
      </div>
      <div
        role="progressbar"
        aria-label="Unseal progress"
        aria-valuemin={0}
        aria-valuemax={status.threshold}
        aria-valuenow={status.progress}
        aria-valuetext={label}
        className="flex gap-1.5"
      >
        {segments.map((filled, index) => (
          <span
            key={index}
            className={`h-2 flex-1 rounded-full transition-colors duration-300 motion-reduce:transition-none ${filled ? 'bg-primary-500' : 'bg-background-200'}`}
          />
        ))}
      </div>
      {status.nonce && (
        <p className="truncate font-mono text-[10px] text-foreground-400" title={status.nonce}>
          Attempt {status.nonce}
        </p>
      )}
    </div>
  );
}
