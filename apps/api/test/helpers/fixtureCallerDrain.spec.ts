import { describe, expect, it } from "vitest";
import { withFixtureCallerDrain } from "./fixtureCallerDrain";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe("opposition fixture caller cleanup", () => {
  it.each(["entry", "blocker", "destination assertion"])("retains the %s error after releasing and draining every started caller", async stage => {
    const released = deferred<undefined>();
    const finish = deferred<undefined>();
    const draining = deferred<undefined>();
    const failure = new Error(`${stage} failed`);
    const completed: string[] = [];
    let settled = false;
    const result = withFixtureCallerDrain(() => released.resolve(undefined), async start => {
      void start(async () => {
        await released.promise;
        draining.resolve(undefined);
        await finish.promise;
        completed.push("holder");
        throw new Error("holder failed during cleanup");
      });
      if (stage !== "entry") {
        void start(async () => {
          await released.promise;
          await finish.promise;
          completed.push("opponent");
        });
      }
      throw failure;
    }).then(value => ({ value }), error => ({ error })).finally(() => { settled = true; });
    await draining.promise;
    // Let any prematurely returned result settle before releasing caller completion.
    await new Promise<void>(done => setImmediate(done));
    expect(settled).toBe(false);
    expect(completed).toEqual([]);
    finish.resolve(undefined);
    const observed = await result;
    expect(observed).toEqual({ error: failure });
    expect("error" in observed && observed.error).toBe(failure);
    expect(completed.sort()).toEqual(stage === "entry" ? ["holder"] : ["holder", "opponent"]);
  });

  it("preserves an initial caller rejection before the entry barrier", async () => {
    const entered = deferred<undefined>();
    const failure = new Error("initial caller exited");
    let released = false;
    const result = withFixtureCallerDrain(() => { released = true; }, async start => {
      const caller = start(async () => { throw failure; });
      await Promise.race([entered.promise, caller]);
    });
    await expect(result).rejects.toBe(failure);
    expect(released).toBe(true);
  });

  it("drains the holder when starting the opponent throws synchronously", async () => {
    const released = deferred<undefined>();
    const failure = new Error("opponent entry failed");
    let completed = false;
    const result = withFixtureCallerDrain(() => released.resolve(undefined), async start => {
      void start(async () => { await released.promise; completed = true; });
      start(() => { throw failure; });
    });
    await expect(result).rejects.toBe(failure);
    expect(completed).toBe(true);
  });

  it("returns the original success only after the released caller settles", async () => {
    const released = deferred<undefined>();
    let completed = false;
    const result = await withFixtureCallerDrain(() => released.resolve(undefined), async start => {
      void start(async () => { await released.promise; completed = true; });
      return "observed";
    });
    expect(result).toBe("observed");
    expect(completed).toBe(true);
  });
});
