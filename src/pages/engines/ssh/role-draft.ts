import type { SshCaRoleInput, SshOtpRole, SshRoleInput } from '@/domain/engines/ssh/ssh';
import {
  formatKeyLengths,
  formatOptionLines,
  joinList,
  parseKeyLengths,
  parseOptionLines,
  splitList,
  SSH_STANDARD_EXTENSIONS,
} from '@/domain/engines/ssh/ssh-keys';
import { sshRoleInputErrors, type SshRoleFieldErrors } from '@/domain/engines/ssh/ssh-roles';

const STANDARD = new Set<string>(SSH_STANDARD_EXTENSIONS.map((extension) => extension.name));

/** Form state for a CA role: free-text fields stay strings until submit. */
export interface CaRoleDraft extends Omit<SshCaRoleInput, 'allowedExtensions' | 'defaultExtensions' | 'defaultCriticalOptions' | 'allowedUserKeyLengths'> {
  readonly allowedStandard: readonly string[];
  readonly defaultStandard: readonly string[];
  /** Comma list of non-standard allowed extensions, or `*`. */
  readonly otherAllowedExtensions: string;
  /** `name` or `name=value` lines for non-standard default extensions. */
  readonly otherDefaultExtensions: string;
  readonly defaultCriticalOptions: string;
  readonly allowedUserKeyLengths: string;
}

export interface OtpRoleDraft extends Omit<SshOtpRole, 'port'> {
  readonly port: string;
}

export type RoleDraft = CaRoleDraft | OtpRoleDraft;

export function roleDraft(input: SshRoleInput): RoleDraft {
  if (input.keyType === 'otp') return { ...input, port: String(input.port) };
  const { allowedExtensions, defaultExtensions, defaultCriticalOptions, allowedUserKeyLengths, ...rest } = input;
  const allowed = splitList(allowedExtensions);
  const defaults = Object.entries(defaultExtensions);
  return {
    ...rest,
    allowedStandard: allowed.filter((name) => STANDARD.has(name)),
    defaultStandard: defaults.filter(([name, value]) => STANDARD.has(name) && !value).map(([name]) => name),
    otherAllowedExtensions: joinList(allowed.filter((name) => !STANDARD.has(name))),
    otherDefaultExtensions: formatOptionLines(Object.fromEntries(defaults.filter(([name, value]) => !STANDARD.has(name) || value))),
    defaultCriticalOptions: formatOptionLines(defaultCriticalOptions),
    allowedUserKeyLengths: formatKeyLengths(allowedUserKeyLengths),
  };
}

export type RoleDraftErrors = SshRoleFieldErrors & Partial<Record<'otherDefaultExtensions' | 'defaultCriticalOptions' | 'allowedUserKeyLengths', string>>;

export type RoleDraftResult =
  | { readonly ok: true; readonly input: SshRoleInput }
  | { readonly ok: false; readonly errors: RoleDraftErrors };

function otpInput(draft: OtpRoleDraft): RoleDraftResult {
  const port = /^\d+$/.test(draft.port.trim()) ? Number(draft.port.trim()) : Number.NaN;
  const input: SshOtpRole = { ...draft, port };
  const errors = sshRoleInputErrors(input);
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, input };
}

/** Validates the draft and assembles what Vault receives. */
export function roleInputFromDraft(draft: RoleDraft): RoleDraftResult {
  if (draft.keyType === 'otp') return otpInput(draft);
  const { allowedStandard, defaultStandard, otherAllowedExtensions, otherDefaultExtensions, ...rest } = draft;
  const otherDefaults = parseOptionLines(otherDefaultExtensions);
  const critical = parseOptionLines(draft.defaultCriticalOptions);
  const lengths = parseKeyLengths(draft.allowedUserKeyLengths);
  const errors: RoleDraftErrors = {};
  if (!otherDefaults.ok) errors.otherDefaultExtensions = otherDefaults.message;
  if (!critical.ok) errors.defaultCriticalOptions = critical.message;
  if (!lengths.ok) errors.allowedUserKeyLengths = lengths.message;
  if (!otherDefaults.ok || !critical.ok || !lengths.ok) return { ok: false, errors: { ...errors, ...sshRoleInputErrors({ ...emptyMaps(rest) }) } };

  const input: SshCaRoleInput = {
    ...rest,
    allowedExtensions: joinList([...allowedStandard, ...splitList(otherAllowedExtensions)]),
    defaultExtensions: { ...Object.fromEntries(defaultStandard.map((name) => [name, ''])), ...otherDefaults.value },
    defaultCriticalOptions: critical.value,
    allowedUserKeyLengths: lengths.value,
  };
  const fieldErrors = sshRoleInputErrors(input);
  return Object.keys(fieldErrors).length > 0 ? { ok: false, errors: fieldErrors } : { ok: true, input };
}

function emptyMaps(rest: Omit<CaRoleDraft, 'allowedStandard' | 'defaultStandard' | 'otherAllowedExtensions' | 'otherDefaultExtensions'>): SshCaRoleInput {
  return { ...rest, allowedExtensions: '', defaultExtensions: {}, defaultCriticalOptions: {}, allowedUserKeyLengths: {} };
}
