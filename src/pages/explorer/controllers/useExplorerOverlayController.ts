import { useEffect, useState } from 'react';

import type { SecretWorkspaceMode } from '../components/SecretWorkspace';

export function useExplorerOverlayController(
  activeMount: string,
  selectedPath: string | null,
) {
  const [createOpen, setCreateOpen] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<SecretWorkspaceMode | null>(null);
  const [writeOnlyOpen, setWriteOnlyOpen] = useState(false);
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [mountConfigOpen, setMountConfigOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);

  useEffect(() => {
    setWriteOnlyOpen(false);
    setMetadataOpen(false);
  }, [activeMount, selectedPath]);
  useEffect(() => setMountConfigOpen(false), [activeMount]);

  return {
    create: {
      open: createOpen,
      show: () => setCreateOpen(true),
      close: () => setCreateOpen(false),
    },
    workspace: {
      mode: workspaceMode,
      show: (mode: SecretWorkspaceMode) => setWorkspaceMode(mode),
      close: () => setWorkspaceMode(null),
    },
    writeOnly: {
      open: writeOnlyOpen,
      show: () => setWriteOnlyOpen(true),
      close: () => setWriteOnlyOpen(false),
    },
    metadata: {
      open: metadataOpen,
      show: () => setMetadataOpen(true),
      close: () => setMetadataOpen(false),
    },
    mountConfig: {
      open: mountConfigOpen,
      show: () => setMountConfigOpen(true),
      close: () => setMountConfigOpen(false),
    },
    comparison: {
      open: compareOpen,
      show: () => setCompareOpen(true),
      close: () => setCompareOpen(false),
    },
  };
}
