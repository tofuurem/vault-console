export interface ConcurrencyLimiter {
  /** Runs `task` once fewer than the limit are active; queued tasks honour `signal`. */
  run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T>;
}

function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError');
}

export function createConcurrencyLimiter(limit: number): ConcurrencyLimiter {
  const maxActive = Math.max(1, Math.floor(limit));
  const queue: Array<() => void> = [];
  let active = 0;

  const release = () => {
    active -= 1;
    queue.shift()?.();
  };

  return {
    run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
      if (signal?.aborted) return Promise.reject(abortError());
      return new Promise<T>((resolve, reject) => {
        const start = () => {
          signal?.removeEventListener('abort', cancel);
          active += 1;
          task().then(resolve, reject).finally(release);
        };
        function cancel() {
          const index = queue.indexOf(start);
          if (index >= 0) queue.splice(index, 1);
          reject(abortError());
        }
        if (active < maxActive) {
          start();
          return;
        }
        signal?.addEventListener('abort', cancel, { once: true });
        queue.push(start);
      });
    },
  };
}
