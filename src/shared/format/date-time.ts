// The interface copy is English, so dates use English month names while still
// following the viewer's time zone.
const DATE_TIME = new Intl.DateTimeFormat('en', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : DATE_TIME.format(date);
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function toTimestamp(value: string | number | Date): number {
  if (value instanceof Date) return value.getTime();
  return typeof value === 'number' ? value : new Date(value).getTime();
}

function relativeUnit(elapsedMs: number): string {
  if (elapsedMs < MINUTE_MS) return 'just now';
  if (elapsedMs < HOUR_MS) return `${Math.floor(elapsedMs / MINUTE_MS)}m`;
  if (elapsedMs < DAY_MS) return `${Math.floor(elapsedMs / HOUR_MS)}h`;
  const days = Math.floor(elapsedMs / DAY_MS);
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

/**
 * Short relative time such as "3d ago" or "in 2h". Values within a minute of
 * `now` read as "just now" so small clock differences with Vault stay calm.
 */
export function formatRelativeTime(
  value: string | number | Date,
  now: number = Date.now(),
): string {
  const timestamp = toTimestamp(value);
  if (Number.isNaN(timestamp)) return typeof value === 'string' ? value : '';
  const difference = now - timestamp;
  const unit = relativeUnit(Math.abs(difference));
  if (unit === 'just now') return unit;
  return difference > 0 ? `${unit} ago` : `in ${unit}`;
}
