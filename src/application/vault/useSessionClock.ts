import { useEffect, useRef, useState } from 'react';

const FIVE_MINUTES_MS = 5 * 60 * 1_000;
const THIRTY_SECONDS_MS = 30 * 1_000;

interface SessionClockOptions {
  readonly expiresAt?: number;
  readonly leaseDurationSeconds?: number;
  readonly onExpire: () => void;
  readonly now?: () => number;
}

export interface SessionClock {
  readonly remainingMs?: number;
  readonly remainingLabel: string;
  readonly warning: boolean;
}

export function sessionWarningThresholdMs(
  leaseDurationSeconds: number | undefined,
): number {
  if (
    leaseDurationSeconds === undefined
    || !Number.isFinite(leaseDurationSeconds)
    || leaseDurationSeconds > 5 * 60
  ) {
    return FIVE_MINUTES_MS;
  }
  return Math.max(THIRTY_SECONDS_MS, leaseDurationSeconds * 1_000 * 0.2);
}

export function formatSessionTtl(remainingMs: number | undefined): string {
  if (remainingMs === undefined) return 'No fixed expiry';
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1_000));
  if (totalSeconds === 0) return 'Expired';
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h remaining`;
  if (totalSeconds >= 3_600) return `${Math.floor(totalSeconds / 3_600)}h ${minutes}m remaining`;
  if (totalSeconds > 5 * 60) return `${minutes}m remaining`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s remaining`;
  return `${seconds}s remaining`;
}

function nextTickDelay(remainingMs: number): number {
  if (remainingMs > FIVE_MINUTES_MS) {
    return Math.min(THIRTY_SECONDS_MS, remainingMs - FIVE_MINUTES_MS);
  }
  return Math.min(1_000, remainingMs);
}

export function useSessionClock({
  expiresAt,
  leaseDurationSeconds,
  onExpire,
  now = Date.now,
}: SessionClockOptions): SessionClock {
  const [currentTime, setCurrentTime] = useState(now);
  const onExpireRef = useRef(onExpire);
  const expiredForRef = useRef<number | undefined>(undefined);
  onExpireRef.current = onExpire;

  useEffect(() => {
    setCurrentTime(now());
    if (expiresAt === undefined) {
      expiredForRef.current = undefined;
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const nextTime = now();
      setCurrentTime(nextTime);
      const remaining = expiresAt - nextTime;
      if (remaining <= 0) {
        if (expiredForRef.current !== expiresAt) {
          expiredForRef.current = expiresAt;
          onExpireRef.current();
        }
        return;
      }
      timer = setTimeout(tick, nextTickDelay(remaining));
    };
    const remaining = expiresAt - now();
    if (remaining <= 0) tick();
    else timer = setTimeout(tick, nextTickDelay(remaining));
    return () => clearTimeout(timer);
  }, [expiresAt, now]);

  const remainingMs = expiresAt === undefined
    ? undefined
    : Math.max(0, expiresAt - currentTime);
  return {
    remainingMs,
    remainingLabel: formatSessionTtl(remainingMs),
    warning: remainingMs !== undefined
      && remainingMs > 0
      && remainingMs <= sessionWarningThresholdMs(leaseDurationSeconds),
  };
}
