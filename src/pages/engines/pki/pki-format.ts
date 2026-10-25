import { normalizeVaultError } from '@/domain/vault/errors';
import { formatDateTime } from '@/shared/format/date-time';

export const SELECT_CLASS = 'h-11 w-full rounded-md border border-background-300 bg-background-50 px-2 text-sm text-foreground-900 focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400/30 disabled:opacity-50 sm:h-8';
export const CARD_CLASS = 'rounded-lg border border-background-300 bg-background-50';
export const LINK_BUTTON_CLASS = 'inline-flex min-h-11 items-center gap-1 rounded px-1 text-left text-xs font-medium text-primary-700 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 sm:min-h-0';
export const ICON_BUTTON_CLASS = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-foreground-500 hover:bg-background-100 hover:text-foreground-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 sm:h-7 sm:w-7';

export function formatDateTimeText(value: string): string {
  return formatDateTime(value);
}

export function formatEpochMs(value: number): string {
  return formatDateTime(new Date(value).toISOString());
}

export function formatEpochSeconds(value: number | undefined): string {
  return value ? formatEpochMs(value * 1000) : 'Unknown';
}

export interface PkiErrorText {
  readonly message: string;
  readonly details: readonly string[];
}

/** A safe message plus Vault's reasons when it gave any. */
export function pkiErrorText(error: unknown): PkiErrorText {
  const normalized = normalizeVaultError(error);
  if (normalized.reason) {
    return { message: 'Vault rejected the request.', details: [normalized.reason] };
  }
  return { message: normalized.message, details: [] };
}

/** A filename-safe stem such as `app.example.com` or `6a-36-9c`. */
export function fileStem(value: string, fallback = 'certificate'): string {
  const stem = value.trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return stem || fallback;
}

/**
 * Saves text as a local file through an in-memory Blob URL. Nothing reaches
 * the address bar, history, or storage, and the URL is revoked right away.
 */
export function downloadText(filename: string, text: string, type = 'application/x-pem-file'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Joins PEM blocks with exactly one newline between and after them. */
export function joinPem(blocks: readonly string[]): string {
  return blocks.map((block) => block.trim()).filter(Boolean).join('\n').concat('\n');
}
