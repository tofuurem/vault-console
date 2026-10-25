import { useState, type FormEvent } from 'react';

import { useEnableEngine } from '@/application/engines/useSecretEngines';
import Button from '@/components/base/Button';
import { Input, Textarea } from '@/components/base/Input';
import Modal from '@/components/base/Modal';
import {
  durationError,
  ENGINE_CATALOG,
  type EngineCatalogEntry,
  type EngineKind,
} from '@/domain/engines/engines';
import { normalizeVaultError } from '@/domain/vault/errors';
import { kvMountPathError, normalizeKvMountPath } from '@/domain/vault/kv-mount';

interface EnableEngineDialogProps {
  readonly open: boolean;
  readonly existingPaths: readonly string[];
  /** Pre-selects an engine type, e.g. from a command palette entry. */
  readonly initialType?: string;
  readonly onClose: () => void;
  readonly onEnabled: (path: string, kind: EngineKind) => void;
}

function catalogEntry(type: string | undefined): EngineCatalogEntry {
  return ENGINE_CATALOG.find((entry) => entry.type === type) ?? ENGINE_CATALOG[1];
}

function EngineTypePicker({
  selected,
  onSelect,
}: {
  readonly selected: EngineCatalogEntry;
  readonly onSelect: (entry: EngineCatalogEntry) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-xs font-medium text-foreground-700">Engine type</legend>
      <div role="radiogroup" className="grid gap-1.5 sm:grid-cols-2">
        {ENGINE_CATALOG.map((entry) => {
          const active = entry.type === selected.type;
          return (
            <button
              key={entry.type}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onSelect(entry)}
              className={`flex items-start gap-2.5 rounded-md border p-2.5 text-left transition-[border-color,background-color,transform] duration-150 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 motion-reduce:active:scale-100 ${
                active
                  ? 'border-primary-400 bg-primary-50'
                  : 'border-background-300 bg-background-50 hover:border-background-400 hover:bg-background-100'
              }`}
            >
              <i className={`${entry.icon} mt-0.5 text-base ${active ? 'text-primary-600' : 'text-foreground-500'}`} aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-foreground-900">{entry.label}</span>
                <span className="mt-0.5 block text-[11px] leading-4 text-foreground-600">{entry.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Enables any supported secrets engine at a new mount path. */
export default function EnableEngineDialog({
  open,
  existingPaths,
  initialType,
  onClose,
  onEnabled,
}: EnableEngineDialogProps) {
  const [entry, setEntry] = useState(() => catalogEntry(initialType));
  const [path, setPath] = useState(entry.defaultPath);
  const [pathEdited, setPathEdited] = useState(false);
  const [description, setDescription] = useState('');
  const [defaultTtl, setDefaultTtl] = useState('');
  const [maxTtl, setMaxTtl] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const mutation = useEnableEngine();

  const normalizedPath = normalizeKvMountPath(path);
  const pathError = kvMountPathError(path)
    ?? (existingPaths.includes(normalizedPath) ? 'Another engine already uses this path.' : undefined);
  const defaultError = durationError(defaultTtl);
  const maxError = durationError(maxTtl);
  const mutationError = mutation.isError ? normalizeVaultError(mutation.error) : undefined;

  const reset = () => {
    const initial = catalogEntry(initialType);
    setEntry(initial);
    setPath(initial.defaultPath);
    setPathEdited(false);
    setDescription('');
    setDefaultTtl('');
    setMaxTtl('');
    setShowErrors(false);
    mutation.reset();
  };
  const close = () => {
    if (mutation.isPending) return;
    reset();
    onClose();
  };
  const selectType = (next: EngineCatalogEntry) => {
    setEntry(next);
    if (!pathEdited) setPath(next.defaultPath);
    mutation.reset();
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setShowErrors(true);
    if (pathError || defaultError || maxError) return;
    mutation.mutate(
      {
        path: normalizedPath,
        type: entry.type,
        description,
        options: entry.options,
        defaultLeaseTtl: defaultTtl,
        maxLeaseTtl: maxTtl,
      },
      {
        onSuccess: () => {
          const kind = entry.kind;
          reset();
          onEnabled(normalizedPath, kind);
        },
      },
    );
  };

  return (
    <Modal open={open} onClose={close} title="Enable secrets engine" width="lg">
      <form onSubmit={submit}>
        <div className="space-y-4 p-4">
          <EngineTypePicker selected={entry} onSelect={selectType} />
          <Input
            label="Mount path"
            value={path}
            onChange={(event) => {
              setPath(event.target.value);
              setPathEdited(true);
              mutation.reset();
            }}
            error={showErrors ? pathError : undefined}
            hint="Applications call this engine at /v1/<path>/…"
            spellCheck={false}
            monospace
          />
          <Textarea
            label="Description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
            maxLength={512}
          />
          <details className="group rounded-md border border-background-300">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 px-3 text-xs font-medium text-foreground-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400 sm:min-h-9">
              <i className="ri-arrow-right-s-line transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
              Lease limits
              <span className="font-normal text-foreground-500">· optional</span>
            </summary>
            <div className="grid gap-3 border-t border-background-200 p-3 sm:grid-cols-2">
              <Input
                label="Default lease TTL"
                value={defaultTtl}
                onChange={(event) => setDefaultTtl(event.target.value)}
                placeholder="System default"
                error={defaultError}
                monospace
              />
              <Input
                label="Max lease TTL"
                value={maxTtl}
                onChange={(event) => setMaxTtl(event.target.value)}
                placeholder="System default"
                error={maxError}
                monospace
              />
            </div>
          </details>
          {mutationError && (
            <div role="alert" className="rounded-md border border-danger-200 bg-danger-50 p-3 text-xs leading-5 text-danger-800">
              <p className="font-semibold">Engine was not enabled</p>
              <p>{mutationError.message}</p>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-background-200 px-4 py-3">
          <Button type="button" size="sm" onClick={close} disabled={mutation.isPending}>Cancel</Button>
          <Button type="submit" size="sm" variant="primary" loading={mutation.isPending}>
            Enable {entry.label.split(' ')[0]}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
