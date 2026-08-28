import { useBulkDeleteKeysController } from './useBulkDeleteKeysController';
import { useBulkDestroyController } from './useBulkDestroyController';
import { useBulkSoftDeleteController } from './useBulkSoftDeleteController';

interface ExplorerBulkControllerOptions {
  readonly activeMount: string;
  readonly activePath: string;
  readonly refreshPaths: (
    mount: string,
    directoryPath: string,
    paths: readonly string[],
  ) => Promise<void>;
  readonly clearSelection: () => void;
}

export function useExplorerBulkController(options: ExplorerBulkControllerOptions) {
  const softDelete = useBulkSoftDeleteController(options);
  const destroy = useBulkDestroyController(options);
  const deleteKeys = useBulkDeleteKeysController(options);
  return { softDelete, destroy, deleteKeys };
}
