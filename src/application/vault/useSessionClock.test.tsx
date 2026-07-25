import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  formatSessionTtl,
  sessionWarningThresholdMs,
  useSessionClock,
} from './useSessionClock';

function ClockProbe({
  expiresAt,
  leaseDurationSeconds,
  onExpire,
}: {
  readonly expiresAt?: number;
  readonly leaseDurationSeconds?: number;
  readonly onExpire: () => void;
}) {
  const clock = useSessionClock({ expiresAt, leaseDurationSeconds, onExpire });
  return (
    <>
      <output data-testid="remaining">{clock.remainingLabel}</output>
      <output data-testid="warning">{String(clock.warning)}</output>
    </>
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe('session clock', () => {
  it('ticks every 30 seconds before the final five minutes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    render(<ClockProbe expiresAt={10 * 60 * 1_000} onExpire={vi.fn()} />);

    expect(screen.getByTestId('remaining')).toHaveTextContent('10m remaining');
    act(() => vi.advanceTimersByTime(29_000));
    expect(screen.getByTestId('remaining')).toHaveTextContent('10m remaining');
    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByTestId('remaining')).toHaveTextContent('9m remaining');
  });

  it('switches to one-second ticks for the final five minutes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    render(<ClockProbe expiresAt={301_000} onExpire={vi.fn()} />);

    expect(screen.getByTestId('remaining')).toHaveTextContent('5m remaining');
    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByTestId('remaining')).toHaveTextContent('5m 00s remaining');
    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByTestId('remaining')).toHaveTextContent('4m 59s remaining');
  });

  it('expires exactly once and keeps no-expiry sessions timer-free', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const onExpire = vi.fn();
    const view = render(<ClockProbe expiresAt={1_000} onExpire={onExpire} />);

    act(() => vi.advanceTimersByTime(5_000));
    expect(onExpire).toHaveBeenCalledOnce();
    expect(screen.getByTestId('remaining')).toHaveTextContent('Expired');

    view.rerender(<ClockProbe onExpire={onExpire} />);
    act(() => vi.advanceTimersByTime(60_000));
    expect(onExpire).toHaveBeenCalledOnce();
    expect(screen.getByTestId('remaining')).toHaveTextContent('No fixed expiry');
  });

  it('uses final 20 percent for short leases with a 30-second minimum', () => {
    expect(sessionWarningThresholdMs(600)).toBe(300_000);
    expect(sessionWarningThresholdMs(300)).toBe(60_000);
    expect(sessionWarningThresholdMs(60)).toBe(30_000);
    expect(formatSessionTtl(42_000)).toBe('42s remaining');
  });
});
