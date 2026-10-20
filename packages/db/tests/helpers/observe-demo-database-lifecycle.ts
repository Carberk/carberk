import { EventEmitter, errorMonitor } from "node:events";

import type { Pool, PoolClient } from "pg";

type Phase = "pool.end.resolved" | "postgres.stop.enter" | "postgres.stop.exit";

/** Temporary #897 observation only. Never handles errors or waits for client shutdown. */
export function observeDemoDatabaseLifecycle(pool: Pool): (phase: Phase) => void {
  const started = process.hrtime.bigint();
  const ids = new WeakMap<PoolClient, number>();
  let nextId = 0;
  let sequence = 0;
  let clientEvents = 0;

  const write = (event: string, detail = "") => {
    const elapsedUs = (process.hrtime.bigint() - started) / 1_000n;
    console.log(`[db-teardown-897] seq=${++sequence} elapsedUs=${elapsedUs} event=${event}${detail}`);
  };
  const recordClient = (event: string, client?: PoolClient, error?: unknown) => {
    // At most 96 client/pool records plus one limit record. Phase records remain visible.
    if (clientEvents++ >= 96) {
      if (clientEvents === 97) write("client-events.limit");
      return;
    }
    const id = client ? ids.get(client) : undefined;
    let detail = id === undefined ? "" : ` client=c${id}`;
    if (event.endsWith(".error")) {
      const code = error instanceof Error && "code" in error && error.code === "57P01" ? "57P01" : "other";
      detail += ` code=${code}`;
    }
    write(event, detail);
  };

  pool.on("connect", (client) => {
    ids.set(client, ++nextId);
    recordClient("client.connect", client);
    client.once("end", () => recordClient("client.end", client));
    // pg's event overloads omit symbols. Use the inherited EventEmitter API for monitoring.
    EventEmitter.prototype.on.call(client, errorMonitor, (error: unknown) => recordClient("client.error", client, error));
  });
  pool.on("remove", (client) => recordClient("pool.remove", client));
  EventEmitter.prototype.on.call(pool, errorMonitor, (error: unknown, client?: PoolClient) => recordClient("pool.error", client, error));

  return (phase) => write(phase);
}
