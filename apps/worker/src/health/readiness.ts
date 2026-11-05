/** Mirrors API readiness without crossing the applications' runtime boundary. */
export type ReadinessCheck = () => Promise<void>;

export type ReadinessCheckStatus = "ok" | "failed";

export interface ReadinessResult {
  ready: boolean;
  checks: Record<string, ReadinessCheckStatus>;
}

/** Run all probes concurrently while keeping the response bounded. */
export async function runReadinessChecks(
  checks: Record<string, ReadinessCheck>,
  timeoutMs: number,
): Promise<ReadinessResult> {
  const statuses = await Promise.all(
    Object.entries(checks).map(async ([name, check]): Promise<[string, ReadinessCheckStatus]> => {
      let timer: NodeJS.Timeout | undefined;
      try {
        const timeout = new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("readiness timeout")), timeoutMs);
          timer.unref?.();
        });
        await Promise.race([check(), timeout]);
        return [name, "ok"];
      } catch {
        return [name, "failed"];
      } finally {
        if (timer) clearTimeout(timer);
      }
    }),
  );

  return {
    ready: statuses.every(([, status]) => status === "ok"),
    checks: Object.fromEntries(statuses),
  };
}
