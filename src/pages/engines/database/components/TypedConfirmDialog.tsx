import { useState, type FormEvent, type ReactNode } from 'react';

import Button from '@/components/base/Button';
import { Input } from '@/components/base/Input';
import Modal from '@/components/base/Modal';
import { Notice } from './DatabaseUi';

interface TypedConfirmDialogProps {
  readonly open: boolean;
  readonly title: string;
  /** What the operator must type, usually the resource name. */
  readonly confirmText: string;
  readonly confirmLabel: string;
  readonly pending: boolean;
  readonly error?: string;
  readonly children: ReactNode;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

/** Confirmation for actions that cannot be undone: the operator types the name first. */
export default function TypedConfirmDialog({
  open,
  title,
  confirmText,
  confirmLabel,
  pending,
  error,
  children,
  onCancel,
  onConfirm,
}: TypedConfirmDialogProps) {
  const [typed, setTyped] = useState('');
  const matches = typed.trim() === confirmText;
  const close = () => {
    if (pending) return;
    setTyped('');
    onCancel();
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (matches && !pending) onConfirm();
  };
  return (
    <Modal open={open} onClose={close} title={title} width="sm">
      <form className="space-y-4 p-4" onSubmit={submit}>
        <div className="space-y-2 text-xs leading-5 text-foreground-700">{children}</div>
        <Input
          label={`Type ${confirmText} to confirm`}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          monospace
        />
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" onClick={close} disabled={pending}>Cancel</Button>
          <Button type="submit" size="sm" variant="danger" disabled={!matches} loading={pending}>{confirmLabel}</Button>
        </div>
      </form>
    </Modal>
  );
}
