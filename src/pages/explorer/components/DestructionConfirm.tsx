import { useState } from 'react';
import Modal from '@/components/base/Modal';
import Button from '@/components/base/Button';
import { Input } from '@/components/base/Input';
import type { VaultSecret } from '@/mocks/vault';

interface DestructionConfirmProps {
  open: boolean;
  onClose: () => void;
  secret: VaultSecret | null;
  mode: 'soft-delete' | 'destroy' | 'destroy-all';
  onConfirm: (secret: VaultSecret) => void;
}

const modeConfig = {
  'soft-delete': {
    title: 'Delete Current Version',
    description: 'Soft-delete the current version. This version will be marked as deleted but remains recoverable.',
    confirmLabel: 'Delete version',
    variant: 'danger' as const,
    color: 'red-600',
    icon: 'ri-delete-bin-line',
  },
  'destroy': {
    title: 'Permanently Destroy Version',
    description: 'This will permanently destroy the selected version. The data will be irretrievably lost. This action cannot be reversed.',
    confirmLabel: 'Destroy version',
    variant: 'danger' as const,
    color: 'red-600',
    icon: 'ri-close-circle-line',
  },
  'destroy-all': {
    title: 'Destroy All Versions & Metadata',
    description: 'This will permanently destroy all versions and metadata for this secret. All data will be irretrievably lost. This action cannot be reversed under any circumstances.',
    confirmLabel: 'Destroy everything',
    variant: 'danger' as const,
    color: 'red-600',
    icon: 'ri-alert-line',
  },
};

export default function DestructionConfirm({ open, onClose, secret, mode, onConfirm }: DestructionConfirmProps) {
  const [typedPath, setTypedPath] = useState('');
  const [error, setError] = useState('');

  const config = modeConfig[mode];

  const handleConfirm = () => {
    if (typedPath.trim() !== secret?.path) {
      setError('The path you typed does not match');
      return;
    }
    if (secret) {
      onConfirm(secret);
    }
    setTypedPath('');
    setError('');
    onClose();
  };

  const handleClose = () => {
    setTypedPath('');
    setError('');
    onClose();
  };

  if (!secret) return null;

  return (
    <Modal open={open} onClose={handleClose} title={config.title} width="md">
      <div className="p-4 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
            <i className={`${config.icon} text-red-600 text-sm`} />
          </div>
          <div>
            <p className="text-sm text-foreground-700">{config.description}</p>
            <div className="mt-2 text-xs text-foreground-500 space-y-0.5">
              <div>Secret: <span className="font-mono text-foreground-800">{secret.path}</span></div>
              <div>Mount: <span className="font-mono text-foreground-800">{secret.mount}</span></div>
              <div>Current version: <span className="font-mono text-foreground-800">v{secret.metadata.current_version}</span></div>
            </div>
          </div>
        </div>

        <div className="px-3 py-2 rounded-md bg-red-50 border border-red-200">
          <p className="text-xs text-red-700 font-medium">This action is irreversible</p>
          <p className="text-[11px] text-red-600 mt-0.5">Type the full secret path below to confirm you understand the consequences.</p>
        </div>

        <div>
          <label className="text-xs font-medium text-foreground-700">Type the secret path to confirm:</label>
          <Input
            value={typedPath}
            onChange={(e) => { setTypedPath(e.target.value); setError(''); }}
            placeholder={secret.path}
            monospace
            error={error}
            className="mt-1"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="secondary" size="sm" onClick={handleClose}>Cancel</Button>
          <Button
            variant="danger"
            size="sm"
            onClick={handleConfirm}
            disabled={typedPath.trim() !== secret.path}
          >
            {config.confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}