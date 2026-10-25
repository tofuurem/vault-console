import { decodeBase64, SshWireError, SshWireReader } from './ssh-wire';

export const SSH_PUBLIC_KEY_TYPES = [
  'ssh-ed25519',
  'ssh-rsa',
  'ecdsa-sha2-nistp256',
  'ecdsa-sha2-nistp384',
  'ecdsa-sha2-nistp521',
  'sk-ssh-ed25519@openssh.com',
  'sk-ecdsa-sha2-nistp256@openssh.com',
] as const;

export type SshPublicKeyType = (typeof SSH_PUBLIC_KEY_TYPES)[number];

export interface SshPublicKey {
  readonly type: SshPublicKeyType;
  /** Base64 wire-format key. */
  readonly body: string;
  readonly blob: Uint8Array;
  readonly comment?: string;
}

export type SshPublicKeyResult =
  | { readonly ok: true; readonly key: SshPublicKey }
  | { readonly ok: false; readonly message: string };

function isPublicKeyType(value: string): value is SshPublicKeyType {
  return (SSH_PUBLIC_KEY_TYPES as readonly string[]).includes(value);
}

function failure(message: string): SshPublicKeyResult {
  return { ok: false, message };
}

function embeddedType(blob: Uint8Array): string | undefined {
  try {
    return new SshWireReader(blob).string();
  } catch (error) {
    if (error instanceof SshWireError) return undefined;
    throw error;
  }
}

/** Validates one OpenSSH public key line as found in `~/.ssh/id_*.pub`. */
export function parseSshPublicKey(text: string): SshPublicKeyResult {
  const trimmed = text.trim();
  if (!trimmed) return failure('Paste a public key.');
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(trimmed)) {
    return failure('This is a private key. Paste the matching .pub file instead; the private key stays on your machine.');
  }
  if (trimmed.includes('\n')) return failure('Paste a single public key line.');
  const [type = '', body = '', ...comment] = trimmed.split(/\s+/);
  if (type.endsWith('-cert-v01@openssh.com')) return failure('This is already a certificate. Paste the public key it was made from.');
  if (!isPublicKeyType(type)) {
    return failure('Use an ssh-ed25519, ssh-rsa, ecdsa-sha2-nistp256/384/521, or security-key (sk-) public key.');
  }
  const blob = decodeBase64(body);
  if (!blob) return failure('The key body is not valid base64. Copy the whole line from the .pub file.');
  if (embeddedType(blob) !== type) return failure(`The key body does not contain an ${type} key.`);
  return { ok: true, key: { type, body, blob, ...(comment.length > 0 ? { comment: comment.join(' ') } : {}) } };
}

export function sshPublicKeyError(text: string): string | undefined {
  const result = parseSshPublicKey(text);
  return result.ok ? undefined : result.message;
}

/** The file name OpenSSH looks for next to a key, e.g. `id_ed25519-cert.pub`. */
export function certificateFileName(keyType: string): string {
  const base = keyType.replace(/-cert-v01@openssh\.com$/, '');
  if (base === 'ssh-ed25519') return 'id_ed25519-cert.pub';
  if (base === 'ssh-rsa') return 'id_rsa-cert.pub';
  if (base.startsWith('ecdsa-sha2-')) return 'id_ecdsa-cert.pub';
  if (base === 'sk-ssh-ed25519@openssh.com') return 'id_ed25519_sk-cert.pub';
  if (base === 'sk-ecdsa-sha2-nistp256@openssh.com') return 'id_ecdsa_sk-cert.pub';
  return 'id-cert.pub';
}

const IPV4_OCTET = '(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
const IPV4 = new RegExp(`^${IPV4_OCTET}(\\.${IPV4_OCTET}){3}$`);

function isIpv6(value: string): boolean {
  if (!/^[0-9a-fA-F:.]+$/.test(value) || value.split('::').length > 2) return false;
  let groups = value.split(':');
  const last = groups[groups.length - 1];
  let budget = 8;
  if (last.includes('.')) {
    if (!IPV4.test(last)) return false;
    groups = groups.slice(0, -1);
    budget = 6;
  }
  const compressed = value.includes('::');
  const filled = groups.filter((group) => group !== '');
  if (filled.some((group) => !/^[0-9a-fA-F]{1,4}$/.test(group))) return false;
  if (compressed) return filled.length < budget;
  return filled.length === budget && groups.length === budget;
}

/** A plain IPv4 or IPv6 address, no CIDR suffix or zone. */
export function ipAddressError(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return 'Enter the IP address of the host.';
  return IPV4.test(trimmed) || isIpv6(trimmed) ? undefined : 'Use an IPv4 address such as 10.0.0.5 or an IPv6 address.';
}

/** Splits a comma- or newline-separated list, trimming blanks. */
export function splitList(value: string): readonly string[] {
  return value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
}

export function joinList(values: readonly string[]): string {
  return values.join(',');
}

export type ParseResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string };

/** Parses `name` or `name=value` lines (critical options such as `source-address=10.0.0.0/8`). */
export function parseOptionLines(text: string): ParseResult<Readonly<Record<string, string>>> {
  const options: Record<string, string> = {};
  for (const line of text.split('\n').map((item) => item.trim()).filter(Boolean)) {
    const separator = line.indexOf('=');
    const name = (separator < 0 ? line : line.slice(0, separator)).trim();
    if (!/^[A-Za-z0-9@._-]+$/.test(name)) return { ok: false, message: `"${name || line}" is not a valid option name.` };
    options[name] = separator < 0 ? '' : line.slice(separator + 1).trim();
  }
  return { ok: true, value: options };
}

export function formatOptionLines(options: Readonly<Record<string, string>>): string {
  return Object.entries(options).map(([name, value]) => (value ? `${name}=${value}` : name)).join('\n');
}

/** Parses `rsa=2048,4096` lines into Vault's `allowed_user_key_lengths` map. */
export function parseKeyLengths(text: string): ParseResult<Readonly<Record<string, readonly number[]>>> {
  const lengths: Record<string, readonly number[]> = {};
  for (const line of text.split('\n').map((item) => item.trim()).filter(Boolean)) {
    const [name = '', values = ''] = line.split('=').map((part) => part.trim());
    const numbers = splitList(values).map(Number);
    if (!/^[a-z0-9@.-]+$/i.test(name) || numbers.length === 0 || numbers.some((item) => !Number.isInteger(item) || item < 0)) {
      return { ok: false, message: 'Use one key type per line, such as rsa=2048,4096 or ed25519=0.' };
    }
    lengths[name] = numbers;
  }
  return { ok: true, value: lengths };
}

export function formatKeyLengths(lengths: Readonly<Record<string, readonly number[]>>): string {
  return Object.entries(lengths).map(([name, values]) => `${name}=${values.join(',')}`).join('\n');
}

/** Extensions OpenSSH understands for user certificates. */
export const SSH_STANDARD_EXTENSIONS = [
  { name: 'permit-pty', label: 'Interactive terminal (PTY)' },
  { name: 'permit-port-forwarding', label: 'Port forwarding' },
  { name: 'permit-agent-forwarding', label: 'Agent forwarding' },
  { name: 'permit-X11-forwarding', label: 'X11 forwarding' },
  { name: 'permit-user-rc', label: 'Run ~/.ssh/rc' },
] as const;

/** Lines operators paste into hosts to trust certificates from this CA. */
export function sshTrustSnippets(publicKey: string, mount: string, serverUrl: string, domain = '*.example.com') {
  const key = publicKey.trim();
  const publicKeyUrl = `${serverUrl.replace(/\/+$/, '').replace(/\/v1$/, '')}/v1/${mount}/public_key`;
  return {
    publicKeyUrl,
    sshdInstall: `curl -o /etc/ssh/trusted-user-ca-keys.pem ${publicKeyUrl}`,
    sshdConfig: 'TrustedUserCAKeys /etc/ssh/trusted-user-ca-keys.pem',
    knownHosts: `@cert-authority ${domain} ${key}`,
  };
}

/** Connection hint after signing; the certificate sits next to the private key. */
export function sshConnectHint(keyType: string, principal: string | undefined): string {
  const certificate = certificateFileName(keyType);
  const privateKey = certificate.replace(/-cert\.pub$/, '');
  return `ssh -i ~/.ssh/${privateKey} -o CertificateFile=~/.ssh/${certificate} ${principal || 'user'}@host`;
}
