import type { VaultSessionRevocationState } from '@/application/vault/VaultSessionContext';
import Button from '@/components/base/Button';
import Modal from '@/components/base/Modal';

interface RevokeSessionDialogProps {
  readonly open: boolean;
  readonly revocation: VaultSessionRevocationState;
  readonly onClose: () => void;
  readonly onConfirm: () => Promise<void>;
}

export default function RevokeSessionDialog({
  open,
  revocation,
  onClose,
  onConfirm,
}: RevokeSessionDialogProps) {
  const revoking = revocation.status === 'revoking';
  return (
    <Modal
      open={open}
      onClose={revoking ? () => {} : onClose}
      title="Revoke current token"
      width="md"
    >
      <div className="space-y-4 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-danger-100">
            <i className="ri-shield-cross-line text-sm text-danger-700" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold text-danger-700">This changes state in Vault, not only in this browser.</p>
            <p className="mt-1 text-xs leading-5 text-foreground-600">
              Vault will revoke the calling token. Child tokens and leases or dynamic secrets created by it may also be revoked.
            </p>
          </div>
        </div>
        <p className="rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-[11px] leading-5 text-warning-800">
          Use Sign out instead if you only want to clear this browser tab.
        </p>
        {revocation.status === 'failed' && (
          <div role="alert" className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-700">
            <p className="font-semibold">Token was not revoked</p>
            <p className="mt-1">{revocation.error?.message ?? 'Vault could not complete the revocation.'}</p>
            <p className="mt-1">Your current session remains active.</p>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button size="sm" onClick={onClose} disabled={revoking}>Cancel</Button>
          <Button
            size="sm"
            variant="danger"
            loading={revoking}
            onClick={() => void onConfirm().catch(() => undefined)}
          >
            Revoke token
          </Button>
        </div>
      </div>
    </Modal>
  );
}
