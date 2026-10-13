import { describe, expect, it } from "vitest";

import { createUploadQueue } from "./upload-queue";

/** An upload the test finishes by hand. */
function gate() {
  let finish!: () => void;
  let fail!: (error: Error) => void;
  const done = new Promise<void>((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });
  return { done, finish, fail };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

describe("demo inventory upload queue", () => {
  it("keeps at most the given number of uploads in flight, and uses all of them", async () => {
    const queue = createUploadQueue(3);
    let inFlight = 0;
    let most = 0;
    for (let index = 0; index < 20; index++) {
      await queue.add(async () => {
        inFlight += 1;
        most = Math.max(most, inFlight);
        await tick();
        inFlight -= 1;
      });
    }
    await queue.drain();
    expect(most).toBe(3);
    expect(inFlight).toBe(0);
  });

  it("makes the caller wait for a free slot before the next upload starts", async () => {
    const queue = createUploadQueue(2);
    const first = gate();
    const second = gate();
    await queue.add(() => first.done);
    await queue.add(() => second.done);

    let started = false;
    const third = queue.add(async () => {
      started = true;
    });
    await tick();
    expect(started).toBe(false);

    first.finish();
    await third;
    expect(started).toBe(true);
    second.finish();
    await queue.drain();
  });

  it("waits for every upload before draining, then reports the first failure", async () => {
    const queue = createUploadQueue(4);
    const slow = gate();
    const firstFailure = gate();
    const secondFailure = gate();
    let slowFinished = false;
    await queue.add(async () => {
      await slow.done;
      slowFinished = true;
    });
    await queue.add(() => firstFailure.done);
    await queue.add(() => secondFailure.done);

    const draining = queue.drain();
    firstFailure.fail(new Error("bucket refused the first object"));
    await tick();
    secondFailure.fail(new Error("bucket refused the second object"));
    await tick();
    expect(slowFinished).toBe(false);
    slow.finish();
    await expect(draining).rejects.toThrow("bucket refused the first object");
    expect(slowFinished).toBe(true);
  });

  it("stops taking uploads after one failed", async () => {
    const queue = createUploadQueue(2);
    await queue.add(async () => {
      throw new Error("bucket is gone");
    });
    await tick();
    let started = false;
    await expect(
      queue.add(async () => {
        started = true;
      }),
    ).rejects.toThrow("bucket is gone");
    expect(started).toBe(false);
  });

  it("refuses a concurrency that is not a positive integer", () => {
    expect(() => createUploadQueue(0)).toThrow(/positive integer/);
    expect(() => createUploadQueue(1.5)).toThrow(/positive integer/);
  });
});
