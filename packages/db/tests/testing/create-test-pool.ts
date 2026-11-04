import { Pool } from "pg";

/**
 * Testcontainers can terminate a PostgreSQL connection while Vitest is
 * closing a fixture. pg emits that late server error on the pool, and without
 * a listener Node treats it as an unhandled exception after all assertions
 * passed. Ignore only PostgreSQL's deliberate shutdown code; other pool errors
 * stay fatal so the test cannot hide a real database failure.
 */
export function createTestPool(connectionString: string): Pool {
  const pool = new Pool({ connectionString });
  pool.on("error", (error: Error) => {
    if ((error as Error & { code?: string }).code !== "57P01") throw error;
  });
  return pool;
}
