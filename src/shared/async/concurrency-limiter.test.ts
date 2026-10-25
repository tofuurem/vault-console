import { describe, expect, it } from 'vitest';

import { createConcurrencyLimiter } from './concurrency-limiter';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('createConcurrencyLimiter', () => {
  it('never runs more tasks than the limit at once', async () => {
    const limiter = createConcurrencyLimiter(2);
    const gates = Array.from({ length: 5 }, deferred);
    let active = 0;
    let peak = 0;
    const results = gates.map((gate, index) => limiter.run(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await gate.promise;
      active -= 1;
      return index;
    }));

    await Promise.resolve();
    expect(active).toBe(2);
    gates.forEach((gate) => gate.resolve());

    await expect(Promise.all(results)).resolves.toEqual([0, 1, 2, 3, 4]);
    expect(peak).toBe(2);
  });

  it('drops queued tasks whose signal aborts before they start', async () => {
    const limiter = createConcurrencyLimiter(1);
    const gate = deferred();
    const controller = new AbortController();
    let queuedRan = false;
    const first = limiter.run(() => gate.promise);
    const queued = limiter.run(async () => {
      queuedRan = true;
    }, controller.signal);

    controller.abort();
    await expect(queued).rejects.toMatchObject({ name: 'AbortError' });
    gate.resolve();
    await first;
    expect(queuedRan).toBe(false);
  });

  it('keeps going after a task fails', async () => {
    const limiter = createConcurrencyLimiter(1);
    await expect(limiter.run(async () => {
      throw new Error('boom');
    })).rejects.toThrow('boom');
    await expect(limiter.run(async () => 'next')).resolves.toBe('next');
  });

  it('rejects immediately for an already aborted signal', async () => {
    const limiter = createConcurrencyLimiter(1);
    const controller = new AbortController();
    controller.abort();
    await expect(limiter.run(async () => 'never', controller.signal))
      .rejects.toMatchObject({ name: 'AbortError' });
  });
});
