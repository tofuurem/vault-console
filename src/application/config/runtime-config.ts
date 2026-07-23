export interface VaultConsoleRuntimeConfig {
  readonly allowCustomVaultAddress: boolean;
  readonly userpassMount: string;
  readonly allowCustomUserpassMount: boolean;
}

type RuntimeConfigInput = Readonly<Record<string, unknown>>;

declare global {
  interface Window {
    __VAULT_CONSOLE_CONFIG__?: RuntimeConfigInput;
  }
}

const DEFAULT_RUNTIME_CONFIG: VaultConsoleRuntimeConfig = {
  allowCustomVaultAddress: false,
  userpassMount: 'userpass',
  allowCustomUserpassMount: false,
};

function normalizedMount(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const mount = value.trim().replace(/^\/+|\/+$/g, '');
  if (
    !mount
    || mount.split('/').some((segment) => !segment || segment === '.' || segment === '..')
    || !/^[A-Za-z0-9._/-]+$/.test(mount)
  ) return null;
  return mount;
}

export function resolveRuntimeConfig(input: RuntimeConfigInput | undefined): VaultConsoleRuntimeConfig {
  return {
    allowCustomVaultAddress: typeof input?.allowCustomVaultAddress === 'boolean'
      ? input.allowCustomVaultAddress
      : DEFAULT_RUNTIME_CONFIG.allowCustomVaultAddress,
    userpassMount: normalizedMount(input?.userpassMount) ?? DEFAULT_RUNTIME_CONFIG.userpassMount,
    allowCustomUserpassMount: typeof input?.allowCustomUserpassMount === 'boolean'
      ? input.allowCustomUserpassMount
      : DEFAULT_RUNTIME_CONFIG.allowCustomUserpassMount,
  };
}
