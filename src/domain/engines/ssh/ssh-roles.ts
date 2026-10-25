import { durationError, formatTtlSeconds } from '../engines';
import type { SshCaRole, SshCaRoleInput, SshOtpRole, SshRole, SshRoleInput, SshRoleKeyType } from './ssh';

/** Role names Vault accepts as a single path segment. */
export function sshRoleNameError(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return 'Enter a role name.';
  return /^[A-Za-z0-9][A-Za-z0-9_.@-]*$/.test(trimmed)
    ? undefined
    : 'Use letters, numbers, dots, dashes, underscores, or @, starting with a letter or number.';
}

export function emptyCaRoleInput(): SshCaRoleInput {
  return {
    keyType: 'ca',
    allowUserCertificates: true,
    allowHostCertificates: false,
    allowedUsers: '',
    defaultUser: '',
    allowedDomains: '',
    allowSubdomains: false,
    allowBareDomains: false,
    allowedExtensions: 'permit-pty,permit-port-forwarding,permit-agent-forwarding',
    defaultExtensions: { 'permit-pty': '' },
    allowedCriticalOptions: '',
    defaultCriticalOptions: {},
    allowUserKeyIds: false,
    keyIdFormat: '',
    algorithmSigner: 'default',
    allowedUserKeyLengths: {},
    ttl: '',
    maxTtl: '',
    notBeforeDuration: '30s',
    allowedUsersTemplate: false,
    allowedDomainsTemplate: false,
    defaultUserTemplate: false,
    defaultExtensionsTemplate: false,
    allowEmptyPrincipals: false,
  };
}

export function emptyOtpRole(): SshOtpRole {
  return { keyType: 'otp', defaultUser: '', allowedUsers: '', cidrList: '', excludeCidrList: '', port: 22 };
}

export function emptyRoleInput(keyType: SshRoleKeyType): SshRoleInput {
  return keyType === 'ca' ? emptyCaRoleInput() : emptyOtpRole();
}

/** Seconds as the largest exact Go duration unit: 1800 → 30m, 86400 → 24h. */
export function secondsToDuration(value: number): string {
  if (value <= 0) return '';
  if (value % 3600 === 0) return `${value / 3600}h`;
  if (value % 60 === 0) return `${value / 60}m`;
  return `${value}s`;
}

/** Turns a stored role back into form input; durations become plain seconds. */
export function roleToInput(role: SshRole): SshRoleInput {
  if (role.keyType === 'otp') return role;
  const { ttlSeconds, maxTtlSeconds, notBeforeDurationSeconds, ...rest } = role;
  return { ...rest, ttl: secondsToDuration(ttlSeconds), maxTtl: secondsToDuration(maxTtlSeconds), notBeforeDuration: secondsToDuration(notBeforeDurationSeconds) };
}

export function formatRoleTtl(value: number): string {
  return value > 0 ? formatTtlSeconds(value) : 'Engine default';
}

export type SshRoleFieldErrors = Partial<Record<'ttl' | 'maxTtl' | 'notBeforeDuration' | 'certificates' | 'port' | 'cidrList' | 'defaultUser', string>>;

const CIDR = /^[0-9a-fA-F:.]+\/\d{1,3}$/;

function otpErrors(role: SshOtpRole): SshRoleFieldErrors {
  const errors: SshRoleFieldErrors = {};
  if (!Number.isInteger(role.port) || role.port < 1 || role.port > 65_535) errors.port = 'Use a port between 1 and 65535.';
  const cidrs = role.cidrList.split(',').map((item) => item.trim()).filter(Boolean);
  if (cidrs.some((item) => !CIDR.test(item))) errors.cidrList = 'Use CIDR blocks such as 10.0.0.0/8, separated by commas.';
  if (!role.defaultUser.trim()) errors.defaultUser = 'OTP roles need a default user.';
  return errors;
}

/** Client-side checks; free-text maps (key lengths, options) are validated by the form that owns them. */
export function sshRoleInputErrors(input: SshRoleInput): SshRoleFieldErrors {
  if (input.keyType === 'otp') return otpErrors(input);
  const errors: SshRoleFieldErrors = {};
  const ttl = durationError(input.ttl);
  const maxTtl = durationError(input.maxTtl);
  const notBefore = durationError(input.notBeforeDuration);
  if (ttl) errors.ttl = ttl;
  if (maxTtl) errors.maxTtl = maxTtl;
  if (notBefore) errors.notBeforeDuration = notBefore;
  if (!input.allowUserCertificates && !input.allowHostCertificates) {
    errors.certificates = 'Allow user certificates, host certificates, or both.';
  }
  return errors;
}

export function isCaRole(role: SshRole | SshRoleInput): role is SshCaRole | SshCaRoleInput {
  return role.keyType === 'ca';
}
