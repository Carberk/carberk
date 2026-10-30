/** Own every caller started by an opposition fixture until it settles.
 * Release the holder before draining, including entry and assertion failures.
 * Caller rejection during cleanup must not replace the fixture's original error.
 */
export async function withFixtureCallerDrain<T>(
  release: () => void,
  work: (start: <V>(caller: () => Promise<V>) => Promise<V>) => Promise<T>,
): Promise<T> {
  const callers: Promise<unknown>[] = [];
  const start = <V>(caller: () => Promise<V>): Promise<V> => {
    const promise = caller();
    callers.push(promise);
    return promise;
  };
  try {
    return await work(start);
  } finally {
    release();
    await Promise.allSettled(callers);
  }
}
