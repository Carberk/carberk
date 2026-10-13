/**
 * Runs uploads with at most `concurrency` in flight.
 *
 * `add` returns once its upload has started, so a caller that loads and prepares photos one at a
 * time never gets more than `concurrency` uploads ahead of the bucket. `drain` waits until every
 * upload added so far has finished, then rethrows the first failure. Nothing is left running when
 * it throws, and a failed upload is never an unhandled rejection.
 */
export interface UploadQueue {
  add(upload: () => Promise<void>): Promise<void>;
  drain(): Promise<void>;
}

export function createUploadQueue(concurrency: number): UploadQueue {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error(`Upload concurrency must be a positive integer, got ${concurrency}`);
  }
  let active = 0;
  const waiting: (() => void)[] = [];
  let settled: Promise<void>[] = [];
  const failures: unknown[] = [];

  async function drain(): Promise<void> {
    while (settled.length > 0) {
      const batch = settled;
      settled = [];
      await Promise.all(batch);
    }
    if (failures.length > 0) {
      const [first] = failures.splice(0);
      throw first;
    }
  }

  return {
    async add(upload) {
      // A failed upload stops the run: finish what is in flight and report the failure.
      if (failures.length > 0) await drain();
      while (active >= concurrency) {
        await new Promise<void>((resolve) => waiting.push(resolve));
      }
      active += 1;
      settled.push(
        upload().then(
          () => undefined,
          (error: unknown) => {
            failures.push(error);
          },
        ).finally(() => {
          active -= 1;
          waiting.shift()?.();
        }),
      );
    },
    drain,
  };
}
