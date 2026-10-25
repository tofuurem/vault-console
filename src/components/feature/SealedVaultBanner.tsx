import { Link } from 'react-router-dom';

interface SealedVaultBannerProps {
  readonly onDismiss: () => void;
}

export default function SealedVaultBanner({ onDismiss }: SealedVaultBannerProps) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-warning-300 bg-warning-50 px-4 py-2 text-xs text-warning-900"
    >
      <i className="ri-lock-2-line shrink-0 text-sm text-warning-700" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        Vault is sealed, so requests are failing. It must be unsealed with key shares before the console can continue.
      </span>
      <div className="flex items-center gap-1">
        <Link
          to="/unseal"
          className="inline-flex min-h-11 items-center gap-1 rounded-md bg-warning-700 px-3 font-medium text-background-50 hover:bg-warning-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning-500 sm:min-h-7 sm:px-2.5"
        >
          <i className="ri-lock-unlock-line" aria-hidden="true" />
          Unseal Vault
        </Link>
        <button
          type="button"
          onClick={onDismiss}
          className="min-h-11 rounded-md px-2 font-medium text-warning-900 underline decoration-warning-400 underline-offset-2 hover:bg-warning-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning-500 sm:min-h-7"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
