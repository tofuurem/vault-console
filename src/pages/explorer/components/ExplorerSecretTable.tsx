import { QueryClientContext } from '@tanstack/react-query';
import { useCallback, useContext, useMemo, useState, type ComponentProps } from 'react';

import { VaultSessionContext } from '@/application/vault/VaultSessionContext';
import { useKvSecretSummaries } from '@/application/vault/useKvSecretSummaries';
import SecretTable from './SecretTable';

type ExplorerSecretTableProps = Omit<ComponentProps<typeof SecretTable>, 'summaries' | 'onRowsSeen'> & {
  readonly mount: string;
};

/**
 * Folder table with lazily loaded Updated, Version and Owner columns. Rendered
 * outside the Vault data providers (isolated component tests), it falls back
 * to the plain table with dashes in those columns.
 */
export default function ExplorerSecretTable(props: ExplorerSecretTableProps) {
  const queryClient = useContext(QueryClientContext);
  const vault = useContext(VaultSessionContext);
  const { mount, ...tableProps } = props;
  if (!queryClient || !vault?.session) return <SecretTable {...tableProps} />;
  // Remount per mount so row visibility starts fresh for the new mount.
  return <SummarizedSecretTable key={mount} {...props} />;
}

function SummarizedSecretTable({ mount, ...tableProps }: ExplorerSecretTableProps) {
  const [seenPaths, setSeenPaths] = useState<ReadonlySet<string>>(() => new Set());
  const requestedPaths = useMemo(() => tableProps.entries
    .filter((entry) => entry.kind === 'secret' && seenPaths.has(entry.path))
    .map((entry) => entry.path), [seenPaths, tableProps.entries]);
  const summaries = useKvSecretSummaries(mount, requestedPaths);
  const markSeen = useCallback((paths: readonly string[]) => {
    setSeenPaths((current) => {
      if (paths.every((path) => current.has(path))) return current;
      return new Set([...current, ...paths]);
    });
  }, []);

  return <SecretTable {...tableProps} summaries={summaries} onRowsSeen={markSeen} />;
}
