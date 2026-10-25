import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import type { WorkspaceValidationError } from './WorkspaceErrorSummary';
import { useRevealedErrors } from './useRevealedErrors';

const ORDER = ['overview', 'kv', 'review'] as const;
const ERRORS: readonly WorkspaceValidationError[] = [
  { id: 'name', message: 'Name is required.', step: 'overview', fieldId: 'name' },
  { id: 'rules', message: 'Add a target.', step: 'kv' },
];

function useHarness(errors: readonly WorkspaceValidationError[]) {
  const [step, setStep] = useState<string>('overview');
  const validation = useRevealedErrors(errors, {
    step,
    goTo: (next) => setStep(next),
    goNext: () => setStep(ORDER[ORDER.indexOf(step as typeof ORDER[number]) + 1]),
  });
  return { step, ...validation };
}

describe('useRevealedErrors', () => {
  it('stays quiet on a fresh form', () => {
    const { result } = renderHook(() => useHarness(ERRORS));
    expect(result.current.visibleErrors).toEqual([]);
  });

  it('reveals the current step and stays put when Continue is attempted with errors', () => {
    const { result } = renderHook(() => useHarness(ERRORS));
    act(() => result.current.goNext());

    expect(result.current.step).toBe('overview');
    expect(result.current.visibleErrors.map(({ id }) => id)).toEqual(['name']);
  });

  it('reveals a step when the operator leaves it and shows everything on Review', () => {
    const { result } = renderHook(() => useHarness(ERRORS));
    act(() => result.current.goTo('kv'));
    expect(result.current.visibleErrors.map(({ id }) => id)).toEqual(['name']);

    act(() => result.current.goTo('review'));
    expect(result.current.visibleErrors.map(({ id }) => id)).toEqual(['name', 'rules']);
  });

  it('advances normally when the current step is valid', () => {
    const { result } = renderHook(() => useHarness(ERRORS.slice(1)));
    act(() => result.current.goNext());
    expect(result.current.step).toBe('kv');
    expect(result.current.visibleErrors).toEqual([]);
  });
});
