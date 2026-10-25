import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { useDisableEngine, useEngineTune, useTuneEngine } from '@/application/engines/useSecretEngines';
import { useToast } from '@/application/notifications/ToastContext';
import Button from '@/components/base/Button';
import ContentSkeleton from '@/components/base/ContentSkeleton';
import Drawer from '@/components/base/Drawer';
import { Input, Textarea } from '@/components/base/Input';
import {
  durationError,
  engineLabel,
  formatTtlSeconds,
  secondsToDuration,
  type SecretEngine,
} from '@/domain/engines/engines';
import { normalizeVaultError } from '@/domain/vault/errors';

interface EngineSettingsDrawerProps {
  readonly engine: SecretEngine;
  readonly open: boolean;
  readonly onClose: () => void;
}

function DisableEngineSection({ engine, onDisabled }: { readonly engine: SecretEngine; readonly onDisabled: () => void }) {
  const [typed, setTyped] = useState('');
  const mutation = useDisableEngine(engine.path);
  const confirmed = typed.trim() === engine.path;
  const error = mutation.isError ? normalizeVaultError(mutation.error) : undefined;
  return (
    <section aria-labelledby="engine-danger-title" className="space-y-3 rounded-lg border border-danger-200 bg-danger-50/50 p-3">
      <div>
        <h4 id="engine-danger-title" className="text-xs font-semibold text-danger-700">Disable engine</h4>
        <p className="mt-1 text-xs leading-5 text-foreground-600">
          Vault revokes every lease issued by <span className="font-mono">{engine.path}/</span> and deletes all of its
          data and configuration. This cannot be undone.
        </p>
      </div>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (confirmed) mutation.mutate(undefined, { onSuccess: onDisabled });
        }}
      >
        <Input
          label={`Type ${engine.path} to confirm`}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          monospace
        />
        {error && (
          <p role="alert" className="text-xs text-danger-700">{error.message}</p>
        )}
        <Button type="submit" size="sm" variant="danger" disabled={!confirmed} loading={mutation.isPending}>
          Disable {engine.path}
        </Button>
      </form>
    </section>
  );
}

/** Tune lease limits and description, or disable the mount entirely. */
export default function EngineSettingsDrawer({ engine, open, onClose }: EngineSettingsDrawerProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const tune = useEngineTune(engine.path, open);
  const mutation = useTuneEngine(engine.path);
  const [description, setDescription] = useState('');
  const [defaultTtl, setDefaultTtl] = useState('');
  const [maxTtl, setMaxTtl] = useState('');

  useEffect(() => {
    if (!open || !tune.data) return;
    setDescription(tune.data.description);
    setDefaultTtl(secondsToDuration(tune.data.defaultLeaseTtlSeconds));
    setMaxTtl(secondsToDuration(tune.data.maxLeaseTtlSeconds));
    mutation.reset();
    // Reset only when fresh tune data arrives for an open drawer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tune.data]);

  const defaultError = durationError(defaultTtl);
  const maxError = durationError(maxTtl);
  const tuneError = tune.isError ? normalizeVaultError(tune.error) : undefined;
  const saveError = mutation.isError ? normalizeVaultError(mutation.error) : undefined;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (defaultError || maxError) return;
    const initial = tune.data;
    mutation.mutate(
      {
        description,
        // Vault reports effective TTLs; send only edits so inherited defaults stay inherited.
        defaultLeaseTtl: initial && defaultTtl === secondsToDuration(initial.defaultLeaseTtlSeconds) ? undefined : defaultTtl,
        maxLeaseTtl: initial && maxTtl === secondsToDuration(initial.maxLeaseTtlSeconds) ? undefined : maxTtl,
      },
      { onSuccess: () => toast.success(`Saved settings for ${engine.path}/.`) },
    );
  };

  return (
    <Drawer open={open} onClose={onClose} title={`${engine.path}/ settings`} width="480px">
      <div className="space-y-5 p-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
          <dt className="text-foreground-500">Type</dt>
          <dd className="text-foreground-800">{engineLabel(engine)} <span className="font-mono text-foreground-500">({engine.type})</span></dd>
          <dt className="text-foreground-500">Accessor</dt>
          <dd className="break-all font-mono text-foreground-800">{engine.accessor}</dd>
          {engine.version && (
            <>
              <dt className="text-foreground-500">Plugin version</dt>
              <dd className="font-mono text-foreground-800">{engine.version}</dd>
            </>
          )}
        </dl>

        {tune.isPending && open && <ContentSkeleton variant="list" label="Loading engine settings" />}
        {tuneError && (
          <p role="alert" className="rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-xs leading-5 text-warning-900">
            Settings could not be read: {tuneError.message}
          </p>
        )}
        {tune.data && (
          <form className="space-y-3" onSubmit={submit}>
            <Textarea
              label="Description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              maxLength={512}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Default lease TTL"
                value={defaultTtl}
                onChange={(event) => setDefaultTtl(event.target.value)}
                placeholder="System default"
                hint={`Now: ${formatTtlSeconds(tune.data.defaultLeaseTtlSeconds)}`}
                error={defaultError}
                monospace
              />
              <Input
                label="Max lease TTL"
                value={maxTtl}
                onChange={(event) => setMaxTtl(event.target.value)}
                placeholder="System default"
                hint={`Now: ${formatTtlSeconds(tune.data.maxLeaseTtlSeconds)}`}
                error={maxError}
                monospace
              />
            </div>
            {saveError && (
              <p role="alert" className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-700">
                {saveError.message}
              </p>
            )}
            <div className="flex justify-end">
              <Button type="submit" size="sm" variant="primary" loading={mutation.isPending}>Save settings</Button>
            </div>
          </form>
        )}

        <DisableEngineSection
          key={`${engine.path}-${String(open)}`}
          engine={engine}
          onDisabled={() => {
            toast.success(`Disabled ${engine.path}/.`);
            onClose();
            navigate('/home', { replace: true });
          }}
        />
      </div>
    </Drawer>
  );
}
