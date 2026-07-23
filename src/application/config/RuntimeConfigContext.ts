import { createContext, useContext } from 'react';

import {
  resolveRuntimeConfig,
  type VaultConsoleRuntimeConfig,
} from './runtime-config';

const RuntimeConfigContext = createContext<VaultConsoleRuntimeConfig>(resolveRuntimeConfig(undefined));

export function useRuntimeConfig(): VaultConsoleRuntimeConfig {
  return useContext(RuntimeConfigContext);
}

export { RuntimeConfigContext };
