import { useState } from 'react';

import Button from '@/components/base/Button';
import { Input } from '@/components/base/Input';
import Modal from '@/components/base/Modal';
import { normalizeVaultError } from '@/domain/vault/errors';

export type KvDestructiveAction =
  | { readonly kind: 'delete-latest'; readonly version: number }
  | { readonly kind: 'delete-version'; readonly version: number }
  | { readonly kind: 'destroy-version'; readonly version: number }
  | { readonly kind: 'delete-metadata'; readonly version: number };

interface DestructionConfirmProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly mount: string;
  readonly path: string | null;
  readonly action: KvDestructiveAction | null;
  readonly onConfirm: (action: KvDestructiveAction) => Promise<void>;
}

const copy = {
  'delete-latest': {
    title: 'Soft-delete current version',
    description: 'The current version becomes unreadable, but it can be undeleted later.',
    button: 'Delete current version',
  },
  'delete-version': {
    title: 'Soft-delete selected version',
    description: 'The selected version becomes unreadable, but it can be undeleted later.',
    button: 'Delete version',
  },
  'destroy-version': {
    title: 'Permanently destroy version',
    description: 'Vault permanently removes this version data. This cannot be undone.',
    button: 'Destroy version permanently',
  },
  'delete-metadata': {
    title: 'Delete all versions and metadata',
    description: 'Vault permanently removes the secret, every version, and its metadata. This cannot be undone.',
    button: 'Delete everything permanently',
  },
} as const;

export default function DestructionConfirm({ open, onClose, mount, path, action, onConfirm }: DestructionConfirmProps) {
  const [typedPath, setTypedPath] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  if (!path || !action) return null;
  const fullPath = `${mount}/${path}`;
  const content = copy[action.kind];
  const close = () => {
    setTypedPath('');
    setError('');
    setSubmitting(false);
    onClose();
  };
  const confirm = async () => {
    if (typedPath.trim() !== fullPath) return;
    setSubmitting(true);
    setError('');
    try {
      await onConfirm(action);
      close();
    } catch (cause) {
      setError(normalizeVaultError(cause).message);
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title={content.title} width="md">
      <div className="space-y-4 p-4">
        <div className="flex items-start gap-3"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100"><i className="ri-alert-line text-sm text-red-600" aria-hidden="true" /></div><div><p className="text-sm leading-5 text-foreground-700">{content.description}</p><p className="mt-2 break-all font-mono text-xs text-foreground-800">{fullPath} · v{action.version}</p></div></div>
        {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] leading-5 text-red-700">Type the full logical path to confirm. Permanent actions cannot be rolled back.</div>
        <Input label={`Type ${fullPath} to confirm`} value={typedPath} onChange={(event) => setTypedPath(event.target.value)} placeholder={fullPath} monospace autoComplete="off" />
        <div className="flex justify-end gap-2"><Button size="sm" onClick={close} disabled={submitting}>Cancel</Button><Button size="sm" variant="danger" disabled={typedPath.trim() !== fullPath} loading={submitting} onClick={() => void confirm()}>{content.button}</Button></div>
      </div>
    </Modal>
  );
}
