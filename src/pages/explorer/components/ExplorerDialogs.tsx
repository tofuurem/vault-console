import { lazy, Suspense } from 'react';

import {
  canAttemptKvAction,
  type KvActionPermissions,
} from '@/application/vault/useKvActionPermissions';
import type { KvSecretDetails } from '@/application/vault/useKvExplorerData';
import type { useExplorerBulkController } from '../controllers/useExplorerBulkController';
import type { useExplorerDestructiveController } from '../controllers/useExplorerDestructiveController';
import type { useExplorerMutationController } from '../controllers/useExplorerMutationController';
import type { useExplorerOverlayController } from '../controllers/useExplorerOverlayController';
import CreateSecretDrawer from './CreateSecretDrawer';
import DestructionConfirm from './DestructionConfirm';
import KvMountConfigDrawer from './KvMountConfigDrawer';
import SecretMetadataDrawer from './SecretMetadataDrawer';
import SecretWorkspace from './SecretWorkspace';
import VersionComparison from './VersionComparison';
import WriteOnlySecretDrawer from './WriteOnlySecretDrawer';

const BulkDestroyDialog = lazy(() => import('./BulkDestroyDialog'));
const BulkPermanentDeleteDialog = lazy(() => import('./BulkPermanentDeleteDialog'));
const BulkSoftDeleteDialog = lazy(() => import('./BulkSoftDeleteDialog'));

interface ExplorerDialogsProps {
  readonly activeMount: string;
  readonly activePath: string;
  readonly selectedPath: string | null;
  readonly selectedDetails?: KvSecretDetails;
  readonly selectedPermissions?: KvActionPermissions;
  readonly overlays: ReturnType<typeof useExplorerOverlayController>;
  readonly mutations: ReturnType<typeof useExplorerMutationController>;
  readonly destructive: ReturnType<typeof useExplorerDestructiveController>;
  readonly bulk: ReturnType<typeof useExplorerBulkController>;
}

export default function ExplorerDialogs({
  activeMount,
  activePath,
  selectedPath,
  selectedDetails,
  selectedPermissions,
  overlays,
  mutations,
  destructive,
  bulk,
}: ExplorerDialogsProps) {
  const softDelete = bulk.softDelete.state;
  const destroy = bulk.destroy.state;
  const deleteKeys = bulk.deleteKeys.state;
  return (
    <>
      <CreateSecretDrawer open={overlays.create.open} onClose={overlays.create.close} mount={activeMount} currentPath={activePath} onSave={mutations.createSecret} />
      <WriteOnlySecretDrawer
        open={overlays.writeOnly.open}
        mount={activeMount}
        path={selectedPath}
        currentVersion={selectedDetails?.history?.currentVersion}
        onClose={overlays.writeOnly.close}
        onSave={mutations.writeOnlySecret}
      />
      <SecretMetadataDrawer
        open={overlays.metadata.open}
        mount={activeMount}
        path={selectedPath}
        onClose={overlays.metadata.close}
        onLoad={mutations.loadSecretMetadata}
        onSave={mutations.saveSecretMetadata}
      />
      <KvMountConfigDrawer
        open={overlays.mountConfig.open}
        mount={activeMount}
        onClose={overlays.mountConfig.close}
        onLoad={mutations.loadMountConfig}
        onSave={mutations.saveMountConfig}
      />
      <SecretWorkspace
        open={overlays.workspace.mode !== null}
        initialMode={overlays.workspace.mode ?? 'view'}
        secret={selectedDetails?.secret}
        canEdit={canAttemptKvAction(selectedPermissions, 'canEdit')}
        onClose={overlays.workspace.close}
        onSave={mutations.editSecret}
      />
      <VersionComparison
        open={overlays.comparison.open}
        onClose={overlays.comparison.close}
        mount={activeMount}
        path={selectedPath}
        history={selectedDetails?.history}
        currentSecret={selectedDetails?.secret}
        loadVersion={mutations.loadVersion}
        onRestore={mutations.restoreVersion}
      />
      <DestructionConfirm
        open={Boolean(destructive.target)}
        onClose={destructive.close}
        mount={destructive.target?.mount ?? activeMount}
        path={destructive.target?.path ?? null}
        action={destructive.target?.action ?? null}
        onConfirm={destructive.confirm}
      />
      {softDelete && (
        <Suspense fallback={<LazyBulkDialogFallback label="Preparing soft-delete…" />}>
          <BulkSoftDeleteDialog
            open
            mount={softDelete.mount}
            requestedCount={softDelete.paths.length}
            preflight={softDelete.preflight}
            error={softDelete.error}
            preparing={softDelete.status === 'preparing'}
            submitting={softDelete.status === 'submitting'}
            onClose={bulk.softDelete.close}
            onRetry={() => void bulk.softDelete.begin(
              softDelete.paths,
              softDelete.mount,
              softDelete.directoryPath,
            )}
            onConfirm={() => void bulk.softDelete.confirm()}
          />
        </Suspense>
      )}
      {destroy && (
        <Suspense fallback={<LazyBulkDialogFallback label="Preparing version destroy…" />}>
          <BulkDestroyDialog
            open
            mount={destroy.mount}
            requestedCount={destroy.paths.length}
            preflight={destroy.preflight}
            error={destroy.error}
            preparing={destroy.status === 'preparing'}
            submitting={destroy.status === 'submitting'}
            onClose={bulk.destroy.close}
            onRetry={() => void bulk.destroy.begin(
              destroy.paths,
              destroy.mount,
              destroy.directoryPath,
            )}
            onConfirm={(targets) => void bulk.destroy.confirm(targets)}
          />
        </Suspense>
      )}
      {deleteKeys && (
        <Suspense fallback={<LazyBulkDialogFallback label="Preparing permanent key deletion…" />}>
          <BulkPermanentDeleteDialog
            open
            mount={deleteKeys.mount}
            requestedCount={deleteKeys.paths.length}
            preflight={deleteKeys.preflight}
            outcomes={deleteKeys.outcomes}
            error={deleteKeys.error}
            preparing={deleteKeys.status === 'preparing'}
            submitting={deleteKeys.status === 'submitting'}
            onClose={bulk.deleteKeys.close}
            onRetry={() => void bulk.deleteKeys.begin(
              deleteKeys.paths,
              deleteKeys.mount,
              deleteKeys.directoryPath,
            )}
            onConfirm={() => void bulk.deleteKeys.confirm()}
          />
        </Suspense>
      )}
    </>
  );
}

function LazyBulkDialogFallback({ label }: { readonly label: string }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-overlay/40">
      <div
        role="status"
        className="flex items-center gap-2 rounded-lg border border-background-300 bg-background-50 px-4 py-3 text-xs text-foreground-700 shadow-sm"
      >
        <i className="ri-loader-4-line animate-spin text-primary-500" aria-hidden="true" />
        {label}
      </div>
    </div>
  );
}
