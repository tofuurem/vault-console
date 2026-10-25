import type {
  AuditEvent,
  AuditFilter,
  AuditGateway,
  AuditLogStatus,
  AuditPage,
} from '@/domain/audit/audit-events';
import type { VaultSession } from '@/domain/vault/contracts';
import { normalizeVaultError, VaultError } from '@/domain/vault/errors';
import {
  asArray,
  asBoolean,
  asNumber,
  asObject,
  asString,
  optionalString,
  optionalStringArray,
} from '../vault/http/validation';

export type AuditFetch = typeof globalThis.fetch;

function auditUrl(serverUrl: string, path: string): URL {
  const base = new URL(serverUrl);
  base.pathname = `${base.pathname.replace(/\/+$/, '')}/audit-api/v1/${path}`;
  base.search = '';
  base.hash = '';
  return base;
}

function errorForStatus(status: number): VaultError {
  if (status === 401) return new VaultError('session-expired', { status });
  if (status === 403) return new VaultError('authorization', { status });
  if (status === 404) return new VaultError('not-found', { status });
  if (status === 400) return new VaultError('invalid-request', { status });
  return new VaultError('unavailable', { status });
}

function eventFrom(value: unknown): AuditEvent {
  const event = asObject(value);
  const outcome = asString(event.outcome);
  if (outcome !== 'ok' && outcome !== 'error') throw new VaultError('invalid-response');
  return {
    time: asString(event.time),
    requestId: asString(event.requestId),
    operation: asString(event.operation),
    path: asString(event.path),
    mountType: optionalString(event.mountType),
    mountPoint: optionalString(event.mountPoint),
    actor: asString(event.actor),
    entityId: optionalString(event.entityId),
    policies: optionalStringArray(event.policies),
    remoteAddress: optionalString(event.remoteAddress),
    outcome,
    error: optionalString(event.error),
  };
}

/** Talks to the optional same-origin audit reader with the operator's Vault token. */
export class AuditHttpAdapter implements AuditGateway {
  private readonly fetchRequest: AuditFetch;

  constructor(fetchRequest: AuditFetch = globalThis.fetch.bind(globalThis)) {
    this.fetchRequest = fetchRequest;
  }

  async status(session: VaultSession, signal?: AbortSignal): Promise<AuditLogStatus> {
    const body = asObject(await this.get(session, auditUrl(session.serverUrl, 'status'), signal));
    return {
      available: asBoolean(body.available),
      sizeBytes: asNumber(body.sizeBytes),
      modified: optionalString(body.modified),
    };
  }

  async events(
    session: VaultSession,
    filter: AuditFilter,
    before?: string,
    signal?: AbortSignal,
  ): Promise<AuditPage> {
    const url = auditUrl(session.serverUrl, 'events');
    const params: Record<string, string | undefined> = {
      limit: '100',
      q: filter.text?.trim(),
      operation: filter.operation,
      path: filter.pathPrefix?.trim(),
      actor: filter.actor?.trim(),
      outcome: filter.outcome,
      routine: filter.showRoutine ? 'show' : undefined,
      before,
    };
    Object.entries(params).forEach(([key, value]) => {
      if (value) url.searchParams.set(key, value);
    });
    const body = asObject(await this.get(session, url, signal));
    return {
      events: asArray(body.events).map(eventFrom),
      scannedBytes: asNumber(body.scannedBytes),
      exhausted: asBoolean(body.exhausted),
      nextBefore: optionalString(body.nextBefore),
    };
  }

  private async get(session: VaultSession, url: URL, signal?: AbortSignal): Promise<unknown> {
    try {
      const response = await this.fetchRequest(url, {
        headers: { Accept: 'application/json', 'X-Vault-Token': session.token.reveal() },
        signal,
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
      if (!response.ok) throw errorForStatus(response.status);
      return await response.json();
    } catch (cause) {
      throw normalizeVaultError(cause);
    }
  }
}
