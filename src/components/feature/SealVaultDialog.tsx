import { useEffect, useState } from 'react';

import { useSealVault } from '@/application/vault/useSealVault';
import Button from '@/components/base/Button';
import { Input } from '@/components/base/Input';
import Modal from '@/components/base/Modal';

const CONFIRMATION = 'SEAL VAULT';

interface SealVaultDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSealed: () => void;
}

export default function SealVaultDialog({ open, onClose, onSealed }: SealVaultDialogProps) {
  const { permission, sealing, error, checkPermission, seal } = useSealVault();
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    setTyped('');
    const controller = new AbortController();
    void checkPermission(controller.signal);
    return () => controller.abort();
  }, [checkPermission, open]);

  const confirmed = typed.trim() === CONFIRMATION;
  const blocked = permission === 'denied' || permission === 'checking';
  const submit = async () => {
    if (!confirmed || blocked) return;
    if (await seal()) onSealed();
  };

  return (
    <Modal open={open} onClose={sealing ? () => {} : onClose} title="Seal Vault" width="md">
      <form
        className="space-y-4 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-danger-100">
            <i className="ri-lock-2-line text-sm text-danger-700" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold text-danger-700">Every client loses access until Vault is unsealed.</p>
            <p className="mt-1 text-xs leading-5 text-foreground-600">
              Use this in an incident, for example after a suspected key leak. Applications, the CLI, and this console
              get errors until enough key holders submit their unseal key shares.
            </p>
          </div>
        </div>
        {permission === 'denied' && (
          <p role="alert" className="rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-xs leading-5 text-warning-900">
            Your Vault policy does not allow sealing. It needs <span className="font-mono">sudo</span> and{' '}
            <span className="font-mono">update</span> on <span className="font-mono">sys/seal</span>.
          </p>
        )}
        {permission === 'unknown' && (
          <p className="rounded-md border border-background-300 bg-background-100 px-3 py-2 text-xs leading-5 text-foreground-700">
            Permissions could not be checked in advance. Vault decides when you confirm.
          </p>
        )}
        <Input
          label={`Type ${CONFIRMATION} to confirm`}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          disabled={blocked || sealing}
          monospace
        />
        {error && (
          <div role="alert" className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-700">
            <p className="font-semibold">Vault was not sealed</p>
            <p className="mt-1">{error.message}</p>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" onClick={onClose} disabled={sealing}>Cancel</Button>
          <Button type="submit" size="sm" variant="danger" loading={sealing} disabled={!confirmed || blocked}>
            Seal Vault
          </Button>
        </div>
      </form>
    </Modal>
  );
}
