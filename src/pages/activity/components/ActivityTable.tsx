import type { AuditEvent } from '@/domain/audit/audit-events';
import { formatDateTime } from '@/shared/format/date-time';

const OPERATION_TONES: Readonly<Record<string, string>> = {
  read: 'bg-background-200 text-foreground-700',
  list: 'bg-background-200 text-foreground-700',
  create: 'bg-success-100 text-success-800',
  update: 'bg-primary-100 text-primary-800',
  patch: 'bg-primary-100 text-primary-800',
  delete: 'bg-danger-100 text-danger-800',
};

function EventRow({ event }: { readonly event: AuditEvent }) {
  return (
    <tr className="border-b border-background-100 align-top text-xs hover:bg-background-100/60">
      <td className="whitespace-nowrap px-4 py-2.5 text-foreground-600">
        <time dateTime={event.time} title={event.time}>{formatDateTime(event.time)}</time>
      </td>
      <td className="px-4 py-2.5 font-medium text-foreground-800">
        {event.actor}
        {event.remoteAddress && <span className="block font-mono text-[10px] font-normal text-foreground-500">{event.remoteAddress}</span>}
      </td>
      <td className="px-4 py-2.5">
        <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-medium ${OPERATION_TONES[event.operation] ?? 'bg-background-200 text-foreground-700'}`}>
          {event.operation}
        </span>
      </td>
      <td className="max-w-[28rem] px-4 py-2.5">
        <span className="break-all font-mono text-foreground-800">{event.path || '/'}</span>
        {event.error && <span className="mt-0.5 block text-[11px] text-danger-700">{event.error}</span>}
      </td>
      <td className="px-4 py-2.5">
        {event.outcome === 'ok'
          ? <span className="inline-flex items-center gap-1 text-success-700"><i className="ri-check-line" aria-hidden="true" />OK</span>
          : <span className="inline-flex items-center gap-1 text-danger-700"><i className="ri-close-circle-line" aria-hidden="true" />Failed</span>}
      </td>
    </tr>
  );
}

export default function ActivityTable({ events }: { readonly events: readonly AuditEvent[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-background-300 bg-background-50">
      <table className="w-full min-w-[720px] text-left">
        <thead className="border-b border-background-200 bg-background-100 text-[11px] font-medium text-foreground-500">
          <tr>
            <th scope="col" className="px-4 py-2">Time</th>
            <th scope="col" className="px-4 py-2">User</th>
            <th scope="col" className="px-4 py-2">Operation</th>
            <th scope="col" className="px-4 py-2">Path</th>
            <th scope="col" className="px-4 py-2">Result</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => <EventRow key={`${event.requestId}:${event.time}`} event={event} />)}
        </tbody>
      </table>
    </div>
  );
}
