import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  useEffect,
  useState,
  type FormEvent,
} from 'react';

import { vaultQueryKeys } from '@/application/query/vault-query-keys';
import { useKvV2Gateway } from '@/application/vault/KvV2GatewayContext';
import { useVaultSession } from '@/application/vault/VaultSessionContext';
import Button from '@/components/base/Button';
import { Input, Textarea } from '@/components/base/Input';
import Modal from '@/components/base/Modal';
import type { VaultCapabilityMap } from '@/domain/vault/contracts';
import { normalizeVaultError, VaultError } from '@/domain/vault/errors';
import {
  kvMountPathError,
  normalizeKvMountPath,
  type CreateKvV2Mount,
} from '@/domain/vault/kv-mount';

type MountCreationPermission =
  | { readonly state: 'allowed' }
  | { readonly state: 'denied' }
  | { readonly state: 'unknown'; readonly reason: string };

function resolveMountCreationPermission(
  path: string,
  capabilities: VaultCapabilityMap,
): MountCreationPermission {
  const values = capabilities[`sys/mounts/${path}`] ?? [];
  if (values.includes('deny')) return { state: 'denied' };
  if (values.includes('root')) return { state: 'allowed' };
  const canWrite = values.includes('create') || values.includes('update');
  return canWrite && values.includes('sudo')
    ? { state: 'allowed' }
    : { state: 'denied' };
}

interface CreateKvMountDialogProps {
  readonly open: boolean;
  readonly existingMountPaths: readonly string[];
  readonly onClose: () => void;
  readonly onCreated: (path: string) => void;
}

export default function CreateKvMountDialog({
  open,
  existingMountPaths,
  onClose,
  onCreated,
}: CreateKvMountDialogProps) {
  const vault = useVaultSession();
  const session = vault.session!;
  const gateway = useKvV2Gateway();
  const queryClient = useQueryClient();
  const [path, setPath] = useState('');
  const [description, setDescription] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [permissionPath, setPermissionPath] = useState('');
  const normalizedPath = normalizeKvMountPath(path);
  const validationError = kvMountPathError(path);
  const collision = existingMountPaths.includes(normalizedPath)
    ? 'A visible KV v2 mount already uses this path.'
    : undefined;
  const pathError = validationError ?? collision;

  useEffect(() => {
    if (!open || pathError) {
      setPermissionPath('');
      return;
    }
    const timer = setTimeout(() => setPermissionPath(normalizedPath), 300);
    return () => clearTimeout(timer);
  }, [normalizedPath, open, pathError]);

  const readPermission = async (targetPath: string, signal?: AbortSignal) => {
    try {
      const capabilities = await vault.queryCapabilities(
        [`sys/mounts/${targetPath}`],
        signal,
      );
      return resolveMountCreationPermission(targetPath, capabilities);
    } catch (cause) {
      const error = normalizeVaultError(cause);
      if (error.code === 'session-expired' || error.code === 'aborted') throw error;
      return {
        state: 'unknown' as const,
        reason: 'Vault could not preflight this permission. The create request remains authoritative.',
      };
    }
  };
  const permission = useQuery({
    queryKey: vaultQueryKeys.mountCreationPermission(permissionPath),
    queryFn: ({ signal }) => readPermission(permissionPath, signal),
    enabled: open && Boolean(permissionPath),
    staleTime: 10_000,
  });
  const mutation = useMutation({
    mutationFn: async (mount: CreateKvV2Mount) => {
      const decision = await queryClient.fetchQuery({
        queryKey: vaultQueryKeys.mountCreationPermission(mount.path),
        queryFn: ({ signal }) => readPermission(mount.path, signal),
        staleTime: 10_000,
      });
      if (decision.state === 'denied') {
        throw new VaultError('authorization', { status: 403 });
      }
      await gateway.createKvV2Mount(session, mount);
    },
    onSuccess: async (_result, mount) => {
      await queryClient.invalidateQueries({ queryKey: vaultQueryKeys.mounts() });
      setPath('');
      setDescription('');
      setShowErrors(false);
      mutation.reset();
      onCreated(mount.path);
    },
  });

  const close = () => {
    if (mutation.isPending) return;
    mutation.reset();
    setShowErrors(false);
    onClose();
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setShowErrors(true);
    if (pathError) return;
    mutation.mutate({
      path: normalizedPath,
      description: description.trim(),
    });
  };
  const mutationError = mutation.isError ? normalizeVaultError(mutation.error) : undefined;
  const permissionDenied = permission.data?.state === 'denied';

  return (
    <Modal open={open} onClose={close} title="Create KV v2 mount" width="md">
      <form onSubmit={submit}>
        <div className="space-y-4 p-4">
          <div className="rounded-md border border-primary-200 bg-primary-50 px-3 py-2 text-xs leading-5 text-primary-800">
            This creates an isolated KV version 2 secrets engine. Existing mounts are not changed.
          </div>
          <Input
            autoFocus
            label="Mount path"
            value={path}
            onChange={(event) => {
              setPath(event.target.value);
              mutation.reset();
            }}
            placeholder="team/platform"
            error={showErrors ? pathError : undefined}
            monospace
          />
          <Textarea
            label="Description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Secrets owned by the platform team"
            rows={3}
            maxLength={512}
          />

          {normalizedPath && !pathError && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-foreground-500">Vault API preview</p>
              <pre className="overflow-x-auto rounded-md border border-background-300 bg-background-100 p-3 font-mono text-[11px] leading-5 text-foreground-700">{`POST /v1/sys/mounts/${normalizedPath}
{
  "type": "kv",
  "description": ${JSON.stringify(description.trim())},
  "options": { "version": "2" }
}`}</pre>
            </div>
          )}

          {permission.isFetching && permissionPath === normalizedPath && (
            <p role="status" className="text-xs text-foreground-500">
              <i className="ri-loader-4-line mr-1 animate-spin" aria-hidden="true" /> Checking mount permission…
            </p>
          )}
          {permission.data?.state === 'allowed' && permissionPath === normalizedPath && (
            <p role="status" className="text-xs text-emerald-700">
              <i className="ri-shield-check-line mr-1" aria-hidden="true" /> Permission verified for this path.
            </p>
          )}
          {permissionDenied && permissionPath === normalizedPath && (
            <div role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
              This Vault token cannot enable a secrets engine at <span className="font-mono">sys/mounts/{normalizedPath}</span>.
            </div>
          )}
          {permission.data?.state === 'unknown' && permissionPath === normalizedPath && (
            <div role="status" className="rounded-md border border-background-300 bg-background-100 p-3 text-xs leading-5 text-foreground-600">
              {permission.data.reason}
            </div>
          )}
          {mutationError && (
            <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800">
              <p className="font-semibold">Mount was not created</p>
              <p>{mutationError.message}</p>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-background-200 px-4 py-3">
          <Button type="button" variant="secondary" size="sm" onClick={close} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            loading={mutation.isPending}
            disabled={permissionDenied && permissionPath === normalizedPath}
          >
            Create mount
          </Button>
        </div>
      </form>
    </Modal>
  );
}
