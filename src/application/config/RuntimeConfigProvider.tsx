import type { ReactNode } from 'react';

import { RuntimeConfigContext } from './RuntimeConfigContext';
import { resolveRuntimeConfig } from './runtime-config';

interface RuntimeConfigProviderProps {
  readonly children: ReactNode;
  readonly config?: Readonly<Record<string, unknown>>;
}

export function RuntimeConfigProvider({ children, config }: RuntimeConfigProviderProps) {
  const value = resolveRuntimeConfig(config ?? window.__VAULT_CONSOLE_CONFIG__);
  return <RuntimeConfigContext.Provider value={value}>{children}</RuntimeConfigContext.Provider>;
}
