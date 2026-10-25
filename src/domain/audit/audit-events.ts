import type { VaultSession } from '@/domain/vault/contracts';

export type AuditOutcome = 'ok' | 'error';

/** Metadata of one Vault request as recorded by a file audit device. */
export interface AuditEvent {
  readonly time: string;
  readonly requestId: string;
  readonly operation: string;
  readonly path: string;
  readonly mountType?: string;
  readonly mountPoint?: string;
  readonly actor: string;
  readonly entityId?: string;
  readonly policies?: readonly string[];
  readonly remoteAddress?: string;
  readonly outcome: AuditOutcome;
  readonly error?: string;
}

export interface AuditPage {
  readonly events: readonly AuditEvent[];
  readonly scannedBytes: number;
  /** The whole file was scanned; there is nothing older to load. */
  readonly exhausted: boolean;
  readonly nextBefore?: string;
}

export interface AuditLogStatus {
  readonly available: boolean;
  readonly sizeBytes: number;
  readonly modified?: string;
}

export interface AuditFilter {
  readonly text?: string;
  readonly operation?: string;
  readonly pathPrefix?: string;
  readonly actor?: string;
  readonly outcome?: AuditOutcome;
  /** Include successful housekeeping calls such as capabilities-self. */
  readonly showRoutine?: boolean;
}

export interface AuditGateway {
  status(session: VaultSession, signal?: AbortSignal): Promise<AuditLogStatus>;
  events(
    session: VaultSession,
    filter: AuditFilter,
    before?: string,
    signal?: AbortSignal,
  ): Promise<AuditPage>;
}

export const AUDIT_OPERATIONS = ['read', 'list', 'create', 'update', 'delete', 'patch'] as const;

export function auditFilterKey(filter: AuditFilter): readonly string[] {
  return [
    filter.text?.trim() ?? '',
    filter.operation ?? '',
    filter.pathPrefix?.trim() ?? '',
    filter.actor?.trim() ?? '',
    filter.outcome ?? '',
    filter.showRoutine ? 'routine' : '',
  ];
}
