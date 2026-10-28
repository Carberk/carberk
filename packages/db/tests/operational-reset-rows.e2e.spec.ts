import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const operation = "a".repeat(32);
const binding = () => ({ operationId: operation, reservationId: "b".repeat(32), owner: "operator-901", candidate: "c".repeat(40),
  targetIdentity: { projectId: "176ddec0-dd65-4087-b82c-798599fc2ebe", environmentId: "652abc79-fdb0-48b0-9f6c-ad0ff572d7b2",
    services: { api: "6db6f1b1-5c7a-4033-88d0-53f5f315bfc0", worker: "24aa02e0-25a9-4e80-9cc2-c1795ef82091" },
    origins: { database: "postgresql://postgres.railway.internal:5432/railway" } },
  closureGeneration: "d".repeat(32), closureEvidenceDigest: "e".repeat(64),
  expectedInventory: { schema: "1".repeat(64), retained: "2".repeat(64), disposable: "3".repeat(64) }, planDigest: "f".repeat(64) });

describe("operator-owned operational reset row admission", () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:17-alpine").withDatabase("issue901_reset_a_recovery_20261029").start();
    const url = container.getConnectionUri();
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], { cwd: packageRoot,
      env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
    pool = new Pool({ connectionString: url, max: 1 });
    await pool.query(`INSERT INTO users(id,"displayName","updatedAt") VALUES('reset-a-user','Reset A disposable',now());
      INSERT INTO sessions(id,"userId","refreshTokenHash","expiresAt") VALUES('reset-a-session','reset-a-user','non-secret-fixture',now()+interval '1 hour');
      INSERT INTO diagnostic_centers(id,code,names) VALUES('reset-a-center','reset-a-center','{}');
      INSERT INTO diagnostic_template_versions(id,"centerId",version,definition) VALUES('reset-a-template','reset-a-center',1,'{}');
      INSERT INTO inspection_orders(id,"centerId","templateVersionId","commissionerId","requestKey",audience,epoch,"updatedAt","observedVehicle")
        VALUES('reset-a-order','reset-a-center','reset-a-template','reset-a-user','reset-a-order','buyer_private','reset-a-order',now(),'{}');
      INSERT INTO diagnostic_identity_records(id,"orderId","orderVersion",observation,"observationHash","recordedById","recordedAt")
        SELECT 'reset-a-raw',id,version,'{}',repeat('a',64),'reset-a-user',now() FROM inspection_orders WHERE id='reset-a-order';`);
  }, 120000);
  afterAll(async () => { await pool?.end(); await container?.stop(); });

  it("seals server-observed full OLD tuples and rejects commit without finish", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const before = await client.query("SELECT to_jsonb(u) AS row FROM users u WHERE id='reset-a-user'");
      const observed = (await client.query("SELECT staging_clean_reset_rows.observe() AS value")).rows[0].value;
      const result = (await client.query("SELECT staging_clean_reset_rows.prepare($1::jsonb,$2::jsonb) AS value", [binding(), observed])).rows[0].value;
      expect(result).toMatchObject({ operationId: operation, tupleCount: 6, planDigest: expect.stringMatching(/^[a-f0-9]{64}$/) });
      // Full OLD tuples are sealed only in this transaction; the admission record holds digests and counts.
      const sealed = (await client.query("SELECT old FROM pg_temp.operational_reset_sealed WHERE relation='users'")).rows.map(row => row.old);
      expect(sealed).toEqual([before.rows[0].row]);
      const admitted = (await client.query(`SELECT to_jsonb(a)::text AS record, backend_pid=pg_backend_pid() AS backend,
        full_transaction_id=pg_current_xact_id()::text AS transaction FROM staging_clean_reset_rows.admissions a`)).rows;
      expect(admitted).toEqual([expect.objectContaining({ backend: true, transaction: true })]);
      expect(admitted[0].record).not.toContain("non-secret-fixture");
      await expect(client.query("COMMIT")).rejects.toThrow("operational_reset_unfinished");
      expect((await client.query("SELECT count(*)::int AS count FROM staging_clean_reset_rows.admissions")).rows[0].count).toBe(0);
      expect((await client.query("SELECT to_jsonb(u) AS row FROM users u WHERE id='reset-a-user'")).rows).toEqual(before.rows);
    } finally { await client.query("ROLLBACK"); client.release(); }
  });
  it("the admitted full OLD raw record can be deleted before its parent order", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const observed = (await client.query("SELECT staging_clean_reset_rows.observe() AS value")).rows[0].value;
      await client.query("SELECT staging_clean_reset_rows.prepare($1::jsonb,$2::jsonb)", [binding(), observed]);
      const removed = await client.query("DELETE FROM diagnostic_identity_records WHERE id='reset-a-raw'");
      expect(removed.rowCount).toBe(1);
    } finally { await client.query("ROLLBACK"); client.release(); }
  });

  it("an ordinary or forged GUC raw DELETE retains the original guard refusal", async () => {
    const client = await pool.connect();
    try {
      for (const forged of [false,true]) {
        await client.query("BEGIN");
        if (forged) await client.query("SELECT set_config('staging_clean_reset_rows.binding',$1,true)", [JSON.stringify(binding())]);
        await expect(client.query("DELETE FROM diagnostic_identity_records WHERE id='reset-a-raw'")).rejects.toThrow("diagnostic_identity_record_immutable");
        await client.query("ROLLBACK");
      }
    } finally { await client.query("ROLLBACK"); client.release(); }
  });

  it("a principal without operator ownership cannot observe, seal or forge the store", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN; CREATE ROLE reset_runtime_fixture NOLOGIN; SET LOCAL ROLE reset_runtime_fixture");
      await expect(client.query("SELECT staging_clean_reset_rows.observe()")).rejects.toThrow("permission denied for schema staging_clean_reset_rows");
      await client.query("ROLLBACK");
      const authority = (await client.query(`SELECT pg_get_userbyid(nspowner)=current_user AS owned,
        NOT EXISTS(SELECT 1 FROM aclexplode(nspacl) a WHERE a.grantee<>nspowner) AS restricted
        FROM pg_namespace WHERE nspname='staging_clean_reset_rows'`)).rows[0];
      expect(authority).toEqual({ owned: true, restricted: true });
    } finally { await client.query("ROLLBACK"); client.release(); }
  });

  it("missing or malformed binding fields, stale inventory and duplicate admission roll back without effects", async () => {
    const client = await pool.connect();
    try {
      for (const key of Object.keys(binding())) {
        await client.query("BEGIN");
        const observed = (await client.query("SELECT staging_clean_reset_rows.observe() AS value")).rows[0].value;
        const altered = Object.fromEntries(Object.entries(binding()).filter(([name]) => name !== key));
        await expect(client.query("SELECT staging_clean_reset_rows.prepare($1::jsonb,$2::jsonb)", [altered,observed])).rejects.toThrow("operational_reset_binding");
        await client.query("ROLLBACK");
      }
      await client.query("BEGIN");
      const observed = (await client.query("SELECT staging_clean_reset_rows.observe() AS value")).rows[0].value;
      await expect(client.query("SELECT staging_clean_reset_rows.prepare($1::jsonb,$2::jsonb)", [binding(),{...observed,retained:"0".repeat(64)}])).rejects.toThrow("operational_reset_inventory_changed");
      await client.query("ROLLBACK; BEGIN");
      await client.query("SELECT staging_clean_reset_rows.prepare($1::jsonb,$2::jsonb)", [binding(),observed]);
      await expect(client.query("SELECT staging_clean_reset_rows.prepare($1::jsonb,$2::jsonb)", [binding(),observed])).rejects.toThrow("operational_reset_active_admission");
    } finally { await client.query("ROLLBACK"); client.release(); }
  });

  it("sealed OLD bytes cannot authorize a changed tuple or a protected reference", async () => {
    const client = await pool.connect();
    try {
      for (const [table,tuple] of [["diagnostic_identity_records",{id:"reset-a-raw"}],["brands",{id:"reference"}]] as const) {
        await client.query("BEGIN");
        const observed = (await client.query("SELECT staging_clean_reset_rows.observe() AS value")).rows[0].value;
        await client.query("SELECT staging_clean_reset_rows.prepare($1::jsonb,$2::jsonb)", [binding(),observed]);
        await expect(client.query("SELECT staging_clean_reset_rows.allows_old($1,$2::jsonb)",[table,tuple])).rejects.toThrow("operational_reset_old_tuple_changed");
        await client.query("ROLLBACK");
      }
    } finally { await client.query("ROLLBACK"); client.release(); }
  });

  it("an admitted operation cannot be updated, deleted or truncated directly", async () => {
    const client = await pool.connect();
    try {
      for (const sql of ["UPDATE staging_clean_reset_rows.admissions SET tuple_count=0", "DELETE FROM staging_clean_reset_rows.admissions",
        "TRUNCATE staging_clean_reset_rows.completions, staging_clean_reset_rows.admissions"]) {
        await client.query("BEGIN");
        const observed = (await client.query("SELECT staging_clean_reset_rows.observe() AS value")).rows[0].value;
        await client.query("SELECT staging_clean_reset_rows.prepare($1::jsonb,$2::jsonb)", [binding(),observed]);
        await expect(client.query(sql)).rejects.toThrow(/operational_reset_receipt_immutable|pending trigger events/);
        await client.query("ROLLBACK");
      }
    } finally { await client.query("ROLLBACK"); client.release(); }
  });

  it("over 10000 disposable tuples refuses before any admission or DELETE", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`INSERT INTO users(id,"updatedAt") SELECT 'reset-bound-'||i,now() FROM generate_series(1,10000) i`);
      const observed = (await client.query("SELECT staging_clean_reset_rows.observe() AS value")).rows[0].value;
      await expect(client.query("SELECT staging_clean_reset_rows.prepare($1::jsonb,$2::jsonb)", [binding(),observed])).rejects.toThrow("operational_reset_plan_limit");
    } finally { await client.query("ROLLBACK"); client.release(); }
  });

});
