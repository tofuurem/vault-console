export async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  map: (value: T, index: number) => Promise<R>,
): Promise<readonly R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await map(values[index], index);
    }
  };
  const workerCount = Math.min(Math.max(1, concurrency), values.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}
