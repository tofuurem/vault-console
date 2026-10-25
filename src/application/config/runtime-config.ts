export type EnvironmentTone = 'neutral' | 'info' | 'warning' | 'danger';

export interface VaultConsoleRuntimeConfig {
  readonly allowCustomVaultAddress: boolean;
  readonly userpassMount: string;
  readonly allowCustomUserpassMount: boolean;
  /** Short operator-chosen label such as PROD; empty hides the badge. */
  readonly environmentName: string;
  readonly environmentTone: EnvironmentTone;
  /** True when the deployment runs the optional audit reader behind /audit-api/. */
  readonly auditAvailable: boolean;
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
  environmentName: '',
  environmentTone: 'neutral',
  auditAvailable: false,
};

const ENVIRONMENT_TONES: readonly EnvironmentTone[] = ['neutral', 'info', 'warning', 'danger'];

function environmentName(value: unknown): string {
  if (typeof value !== 'string') return '';
  const name = value.trim();
  return name.length <= 24 && /^[A-Za-z0-9._ -]*$/.test(name) ? name : '';
}

function environmentTone(value: unknown): EnvironmentTone {
  return ENVIRONMENT_TONES.find((tone) => tone === value) ?? 'neutral';
}

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
    environmentName: environmentName(input?.environmentName),
    environmentTone: environmentTone(input?.environmentTone),
    auditAvailable: input?.auditAvailable === true,
  };
}

/** Address the pre-session screens contact before the operator edits it. */
export function initialVaultServerUrl(
  config: VaultConsoleRuntimeConfig,
  requested?: unknown,
): string {
  if (!config.allowCustomVaultAddress) return window.location.origin;
  if (typeof requested === 'string' && requested.trim()) return requested;
  return import.meta.env.VITE_VAULT_ADDR || window.location.origin;
}

/** Reads a server URL handed between pre-session routes through history state. */
export function requestedVaultServerUrl(state: unknown): string | undefined {
  if (typeof state !== 'object' || state === null || !('serverUrl' in state)) return undefined;
  const { serverUrl } = state as { readonly serverUrl?: unknown };
  return typeof serverUrl === 'string' ? serverUrl : undefined;
}
