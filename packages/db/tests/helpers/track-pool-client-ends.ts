import type { Pool } from "pg";

/** Register before first use; wait after pool.end(), which can resolve before sockets end. */
export function trackPoolClientEnds(pool: Pool): () => Promise<void> {
  const pending = new Set<Promise<void>>();
  pool.on("connect", (client) => {
    const ended = new Promise<void>((resolve) => {
      client.once("end", () => {
        pending.delete(ended);
        resolve();
      });
    });
    pending.add(ended);
  });

  return async () => {
    await Promise.all(pending);
  };
}
