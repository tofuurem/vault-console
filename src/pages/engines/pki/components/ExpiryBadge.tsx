import Badge from '@/components/base/Badge';
import { expiryState, type Validity } from '@/domain/engines/pki/pki-helpers';
import { formatRelativeTime } from '@/shared/format/date-time';

/** Expired is danger, under 30 days is warning, otherwise a calm success. */
export default function ExpiryBadge({ validity, revoked = false, now = Date.now() }: {
  readonly validity: Validity;
  readonly revoked?: boolean;
  readonly now?: number;
}) {
  if (revoked) return <Badge variant="danger">Revoked</Badge>;
  const state = expiryState(validity, now);
  if (state === 'expired') return <Badge variant="danger">{`Expired ${formatRelativeTime(validity.notAfter, now)}`}</Badge>;
  if (state === 'expiring') return <Badge variant="warning">{`Expires ${formatRelativeTime(validity.notAfter, now)}`}</Badge>;
  if (state === 'not-yet-valid') return <Badge variant="info">Not yet valid</Badge>;
  return <Badge variant="success">Valid</Badge>;
}
