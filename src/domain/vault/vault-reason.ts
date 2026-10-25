const MAX_REASON_LENGTH = 300;
const PEM_START = '-----BEGIN';

function redact(text: string): string {
  return text
    // URL credentials: scheme://user:secret@host
    .replace(/(\/\/[^/\s:@]+:)[^@\s]+@/g, '$1***@')
    // key=value or key: value forms of password-like settings.
    .replace(/\b(password|passwd|pwd|secret|token|otp)(\s*[=:]\s*)("[^"]*"|'[^']*'|\S+)/gi, '$1$2***')
    // SQL literals: PASSWORD 'x', IDENTIFIED BY "x"
    .replace(/\b(password|identified by)(\s+)('[^']*'|"[^"]*")/gi, '$1$2***')
    // Vault tokens.
    .replace(/\bhv[sbr]\.[A-Za-z0-9_-]{8,}/g, '***');
}

/**
 * Turns Vault's `errors` array into one readable sentence for an engine
 * operation. Drops the multierror preamble and anything after a PEM header,
 * redacts password-like values and tokens, and caps the length so a verbose
 * plugin error cannot flood the page. Never retained beyond the error object.
 */
export function sanitizeVaultReason(errors: readonly unknown[]): string | undefined {
  const lines = errors
    .flatMap((error) => (typeof error === 'string' ? error.split(PEM_START)[0].split('\n') : []))
    .map((line) => line.trim().replace(/^\*+\s*/, '').trim())
    .filter((line) => line && !/^\d+ errors? occurred:?$/i.test(line));
  const unique = [...new Set(lines)];
  if (unique.length === 0) return undefined;
  const text = redact(unique.join('; '));
  return text.length > MAX_REASON_LENGTH ? `${text.slice(0, MAX_REASON_LENGTH - 1)}…` : text;
}
