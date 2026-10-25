import { useState, type FormEvent } from 'react';

import { useEngineDelete, useEngineList, useEngineRead, useEngineWrite } from '@/application/engines/useVaultApi';
import { useToast } from '@/application/notifications/ToastContext';
import Button from '@/components/base/Button';
import ContentSkeleton from '@/components/base/ContentSkeleton';
import { Input, Textarea } from '@/components/base/Input';
import Modal from '@/components/base/Modal';
import { useConfirmDialog } from '@/components/base/useConfirmDialog';
import { enginePath, type VaultApiResponse } from '@/domain/engines/engines';
import { normalizeVaultError } from '@/domain/vault/errors';
import { parseSecretJson } from '@/domain/vault/secret-json';
import type { EnginePageProps } from '../engine-page';
import ApiResponsePanel from './ApiResponsePanel';
import EnginePageShell from './EnginePageShell';

function Breadcrumbs({ mount, subPath, navigateTo }: { readonly mount: string; readonly subPath: string; readonly navigateTo: (path: string) => void }) {
  const segments = subPath.split('/').filter(Boolean);
  return (
    <nav aria-label="Path" className="flex min-w-0 flex-wrap items-center gap-0.5 font-mono text-xs">
      <button type="button" onClick={() => navigateTo('')} className="rounded px-1 py-0.5 text-primary-700 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400">
        {mount}/
      </button>
      {segments.map((segment, index) => {
        const target = segments.slice(0, index + 1).join('/');
        const last = index === segments.length - 1;
        return (
          <span key={target} className="flex items-center gap-0.5">
            <i className="ri-arrow-right-s-line text-foreground-400" aria-hidden="true" />
            {last ? (
              <span aria-current="location" className="px-1 py-0.5 text-foreground-900">{segment}</span>
            ) : (
              <button type="button" onClick={() => navigateTo(target)} className="rounded px-1 py-0.5 text-primary-700 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400">
                {segment}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}

function WriteDialog({
  open,
  path,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  readonly open: boolean;
  readonly path: string;
  readonly pending: boolean;
  readonly error?: string;
  readonly onClose: () => void;
  readonly onSubmit: (path: string, body: Readonly<Record<string, unknown>>) => void;
}) {
  const [target, setTarget] = useState(path);
  const [source, setSource] = useState('{\n  \n}');
  const parsed = parseSecretJson(source);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (parsed.ok && target.trim()) onSubmit(target.trim().replace(/^\/+|\/+$/g, ''), parsed.data);
  };
  return (
    <Modal open={open} onClose={pending ? () => {} : onClose} title="Write to path" width="lg">
      <form className="space-y-3 p-4" onSubmit={submit}>
        <Input label="Path below the mount" value={target} onChange={(event) => setTarget(event.target.value)} spellCheck={false} monospace />
        <Textarea
          label="Request body (JSON)"
          value={source}
          onChange={(event) => setSource(event.target.value)}
          rows={10}
          spellCheck={false}
          error={parsed.ok ? undefined : parsed.message}
          monospace
        />
        <p className="text-[11px] leading-4 text-foreground-500">
          Sent as <span className="font-mono">POST /v1/…</span>. The body is never stored by the console.
        </p>
        {error && <p role="alert" className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button type="submit" size="sm" variant="primary" loading={pending} disabled={!parsed.ok || !target.trim()}>Write</Button>
        </div>
      </form>
    </Modal>
  );
}

function KeyList({ keys, subPath, navigateTo }: { readonly keys: readonly string[]; readonly subPath: string; readonly navigateTo: (path: string) => void }) {
  return (
    <ul className="divide-y divide-background-200 overflow-hidden rounded-lg border border-background-300 bg-background-50">
      {keys.map((key) => {
        const folder = key.endsWith('/');
        const name = key.replace(/\/$/, '');
        return (
          <li key={key}>
            <button
              type="button"
              onClick={() => navigateTo(enginePath(subPath, name))}
              className="flex min-h-11 w-full items-center gap-2 px-3 text-left font-mono text-xs text-foreground-800 transition-colors hover:bg-background-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400 sm:min-h-9"
            >
              <i className={`${folder ? 'ri-folder-line text-primary-500' : 'ri-file-list-3-line text-foreground-500'} text-sm`} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{key}</span>
              <i className="ri-arrow-right-s-line text-foreground-400" aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function BrowserBody({ engine, subPath, navigateTo }: EnginePageProps) {
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirmDialog();
  const list = useEngineList(engine.path, subPath);
  const read = useEngineRead(engine.path);
  const write = useEngineWrite(engine.path);
  const remove = useEngineDelete(engine.path);
  const [response, setResponse] = useState<{ readonly title: string; readonly value: VaultApiResponse | null }>();
  const [writeOpen, setWriteOpen] = useState(false);

  const fullPath = enginePath(engine.path, subPath);
  const listError = list.isError ? normalizeVaultError(list.error) : undefined;
  const readError = read.isError ? normalizeVaultError(read.error) : undefined;
  const keys = list.data ?? [];

  const readPath = () => read.mutate(subPath, {
    onSuccess: (value) => setResponse({ title: `Read ${fullPath}`, value }),
  });
  const deletePath = async () => {
    const confirmed = await confirm({
      title: 'Delete path',
      message: `Send DELETE to ${fullPath}? What this removes depends on the engine and cannot be undone.`,
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;
    remove.mutate(subPath, {
      onSuccess: () => {
        toast.success(`Deleted ${fullPath}.`);
        setResponse(undefined);
      },
      onError: (error) => toast.error(normalizeVaultError(error).message, { title: 'Delete failed' }),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Breadcrumbs mount={engine.path} subPath={subPath} navigateTo={navigateTo} />
        <div className="flex gap-1.5">
          {subPath && (
            <>
              <Button size="sm" onClick={readPath} loading={read.isPending}>
                <i className="ri-download-2-line" aria-hidden="true" />
                Read
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void deletePath()} loading={remove.isPending}>
                <i className="ri-delete-bin-line" aria-hidden="true" />
                Delete
              </Button>
            </>
          )}
          <Button size="sm" onClick={() => setWriteOpen(true)}>
            <i className="ri-edit-line" aria-hidden="true" />
            Write
          </Button>
        </div>
      </div>

      <p className="rounded-md border border-background-300 bg-background-100 px-3 py-2 text-xs leading-5 text-foreground-600">
        This engine has no dedicated workspace yet. Browse with LIST; reading is explicit because some paths
        (such as <span className="font-mono">creds/</span>) create new credentials each time.
      </p>

      {readError && (
        <p role="alert" className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-700">{readError.message}</p>
      )}
      {response && (
        <ApiResponsePanel title={response.title} response={response.value} onDismiss={() => setResponse(undefined)} />
      )}

      {list.isPending && <ContentSkeleton variant="list" label="Listing path" />}
      {listError && listError.code !== 'not-found' && (
        <p role="alert" className="rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-xs text-warning-900">
          LIST failed: {listError.message}
        </p>
      )}
      {list.isSuccess && keys.length > 0 && <KeyList keys={keys} subPath={subPath} navigateTo={navigateTo} />}
      {list.isSuccess && keys.length === 0 && (
        <p className="text-xs text-foreground-500">
          Nothing to list here.{subPath ? ' Use Read to fetch this path.' : ' Open a path by URL or write to one.'}
        </p>
      )}
      <WriteDialog
        key={String(writeOpen)}
        open={writeOpen}
        path={subPath}
        pending={write.isPending}
        error={write.isError ? normalizeVaultError(write.error).message : undefined}
        onClose={() => {
          setWriteOpen(false);
          write.reset();
        }}
        onSubmit={(path, body) => write.mutate({ path, body }, {
          onSuccess: (value) => {
            setWriteOpen(false);
            toast.success(`Wrote ${enginePath(engine.path, path)}.`);
            if (value?.data) setResponse({ title: `Response from ${enginePath(engine.path, path)}`, value });
          },
        })}
      />
      {confirmDialog}
    </div>
  );
}

/** Path browser for engines without a dedicated workspace. */
export default function GenericEngineBrowser(props: EnginePageProps) {
  return (
    <EnginePageShell engine={props.engine}>
      {/* Remount per path so read responses never outlive the path they came from. */}
      <BrowserBody key={props.subPath} {...props} />
    </EnginePageShell>
  );
}
