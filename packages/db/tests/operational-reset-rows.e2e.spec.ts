import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const operation = "a".repeat(32);
const binding = () => ({ operationId: operation, reservationId: "b".repeat(32), owner: "operator-901", candidate: "c".repeat(40),
  targetIdentity: { projectId: "176ddec0-dd65-4087-b82c-798599fc2ebe", environmentId: "652abc79-fdb0-48b0-9f6c-ad0ff572d7b2",
    services: { api: "6db6f1b1-5c7a-4033-88d0-53f5f315bfc0", worker: "24aa02e0-25a9-4e80-9cc2-c1795ef82091" },
    origins: { database: "postgresql://postgres.railway.internal:5432/railway" } },
  closureGeneration: "d".repeat(32), closureEvidenceDigest: "e".repeat(64),
  expectedInventory: { schema: "1".repeat(64), retained: "2".repeat(64), disposable: "3".repeat(64) }, planDigest: "f".repeat(64) });
// Fixture arrangement only: an anchor holding the first record needs a source receipt, so it is inserted
// inside the test transaction with replication-role triggers off; every guard is enabled again before use.
const anchorFixture = `SET LOCAL session_replication_role = replica;
  INSERT INTO diagnostic_source_anchors("orderId",state,"firstRecordId",source,"createdTransaction") VALUES('reset-a-order','pending','reset-a-raw','{}','1');
  SET LOCAL session_replication_role = origin`;
const deleteAnchor = `DELETE FROM diagnostic_source_anchors WHERE "orderId"='reset-a-order'`;
// Owning guards that refuse a child DELETE while its parent exists. Each row is arranged like the anchor;
// `change` is an UPDATE the guard ordinarily refuses, and also the post-admission tuple change.
const arranged = (sql: string) => `SET LOCAL session_replication_role = replica; ${sql}; SET LOCAL session_replication_role = origin`;
const ownedRows = [
  { row: "ownership component", parent: "raw record", table: "diagnostic_ownership_components", reads: "diagnostic_identity_records",
    insert: `INSERT INTO diagnostic_ownership_components("identityRecordId","orderId","orderVersion",state)
      SELECT 'reset-a-raw',id,version,'unavailable' FROM inspection_orders WHERE id='reset-a-order'`,
    remove: `DELETE FROM diagnostic_ownership_components WHERE "identityRecordId"='reset-a-raw'`,
    change: `UPDATE diagnostic_ownership_components SET state='erased',"erasedAt"=now() WHERE "identityRecordId"='reset-a-raw'`,
    refusals: { remove: "diagnostic_ownership_immutable", insert: "diagnostic_ownership_binding", change: "diagnostic_ownership_immutable" } },
  { row: "identity evidence", parent: "parent order", table: "diagnostic_identity_evidence", reads: "inspection_orders",
    insert: `INSERT INTO diagnostic_identity_evidence(id,"orderId","orderVersion","identityRecordId","rightsUntil","recordedAt","observationHash","recordHash",identifiers,provenance,rights)
      SELECT 'reset-a-evidence',id,version,'reset-a-raw',now()+interval '1 day',now(),repeat('a',64),repeat('d',64),'[]','[]','{}' FROM inspection_orders WHERE id='reset-a-order'`,
    remove: `DELETE FROM diagnostic_identity_evidence WHERE id='reset-a-evidence'`,
    change: `UPDATE diagnostic_identity_evidence SET "recordHash"=repeat('e',64) WHERE id='reset-a-evidence'`,
    refusals: { remove: "diagnostic_identity_evidence_immutable", insert: "diagnostic_identity_evidence_binding", change: "diagnostic_identity_evidence_immutable" } },
  { row: "identity provenance", parent: "parent order", table: "diagnostic_identity_provenance", reads: "inspection_orders",
    insert: `INSERT INTO diagnostic_identity_provenance(id,"orderId","contentType","declaredSizeBytes","rightsUntil",epoch,rights)
      VALUES('reset-a-provenance','reset-a-order','image/jpeg',1,now()+interval '1 day','reset-a-order','{}')`,
    remove: `DELETE FROM diagnostic_identity_provenance WHERE id='reset-a-provenance'`,
    change: `UPDATE diagnostic_identity_provenance SET "contentType"='image/png' WHERE id='reset-a-provenance'`,
    refusals: { remove: "diagnostic_identity_provenance_immutable", insert: "diagnostic_identity_provenance_binding", change: "diagnostic_identity_provenance_immutable" } },
  { row: "ownership grant", parent: "parent order", table: "diagnostic_ownership_grants", reads: "inspection_orders",
    insert: `INSERT INTO diagnostic_ownership_grants(id,"orderId",state,"erasedAt") VALUES('reset-a-grant','reset-a-order','erased',now())`,
    remove: `DELETE FROM diagnostic_ownership_grants WHERE id='reset-a-grant'`,
    change: `UPDATE diagnostic_ownership_grants SET "erasedAt"="erasedAt"-interval '1 day' WHERE id='reset-a-grant'`,
    refusals: { remove: "diagnostic_ownership_grant_immutable", insert: "diagnostic_ownership_grant_source", change: "diagnostic_ownership_grant_immutable" } },
] as const;
async function admit(client: PoolClient): Promise<void> {
  const observed = (await client.query("SELECT staging_clean_reset_rows.observe() AS value")).rows[0].value;
  await client.query("SELECT staging_clean_reset_rows.prepare($1::jsonb,$2::jsonb)", [binding(), observed]);
}
const selfReferenceCycles = [
  {
    name: "users.suspendedById",
    arrange: `SET LOCAL session_replication_role = replica;
      INSERT INTO users(id,"displayName","updatedAt") VALUES ('reset-cycle-user-a','Reset cycle user A',now()),('reset-cycle-user-b','Reset cycle user B',now());
      UPDATE users SET "suspendedById"='reset-cycle-user-b' WHERE id='reset-cycle-user-a';
      UPDATE users SET "suspendedById"='reset-cycle-user-a' WHERE id='reset-cycle-user-b';
      SET LOCAL session_replication_role = origin`,
    rows: `SELECT id,"suspendedById" FROM users
      WHERE id IN ('reset-cycle-user-a','reset-cycle-user-b') ORDER BY id`,
  },
  {
    name: "diagnostic_reports.predecessorId",
    arrange: `SET LOCAL session_replication_role = replica;
      INSERT INTO diagnostic_reports(id,"orderId","templateVersionId","predecessorId",audience,status,state,"updatedAt") VALUES
        ('reset-cycle-report-a','reset-a-order','reset-a-template','reset-cycle-report-b','buyer_private','draft',
          '{"id":"reset-cycle-report-a","orderId":"reset-a-order","templateVersionId":"reset-a-template","audience":"buyer_private","status":"draft"}',now()),
        ('reset-cycle-report-b','reset-a-order','reset-a-template','reset-cycle-report-a','buyer_private','draft',
          '{"id":"reset-cycle-report-b","orderId":"reset-a-order","templateVersionId":"reset-a-template","audience":"buyer_private","status":"draft"}',now());
      SET LOCAL session_replication_role = origin`,
    rows: `SELECT id,"predecessorId" FROM diagnostic_reports
      WHERE id IN ('reset-cycle-report-a','reset-cycle-report-b') ORDER BY id`,
  },
  {
    name: "diagnostic_identity_evidence.supersedesId",
    arrange: `SET LOCAL session_replication_role = replica;
      INSERT INTO diagnostic_identity_evidence(id,"orderId","orderVersion","identityRecordId","rightsUntil","recordedAt","observationHash","recordHash",identifiers,provenance,rights,"supersedesId") VALUES
        ('reset-cycle-evidence-a','reset-a-order',1,'reset-a-raw',now()+interval '1 day',now(),repeat('a',64),repeat('d',64),'[]','[]','{}','reset-cycle-evidence-b'),
        ('reset-cycle-evidence-b','reset-a-order',2,'reset-a-raw',now()+interval '1 day',now(),repeat('b',64),repeat('e',64),'[]','[]','{}','reset-cycle-evidence-a');
      SET LOCAL session_replication_role = origin`,
    rows: `SELECT id,"supersedesId" FROM diagnostic_identity_evidence
      WHERE id IN ('reset-cycle-evidence-a','reset-cycle-evidence-b') ORDER BY id`,
  },
] as const;

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

  it("the admitted full OLD source anchor can be deleted before its parent order", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(anchorFixture);
      const observed = (await client.query("SELECT staging_clean_reset_rows.observe() AS value")).rows[0].value;
      await client.query("SELECT staging_clean_reset_rows.prepare($1::jsonb,$2::jsonb)", [binding(), observed]);
      expect((await client.query(deleteAnchor)).rowCount).toBe(1);
    } finally { await client.query("ROLLBACK"); client.release(); }
  });

  it("an ordinary, forged GUC or non-operator source anchor DELETE retains the original receipt refusal", async () => {
    const client = await pool.connect();
    try {
      for (const caller of ["ordinary", "forged", "non-operator"] as const) {
        await client.query("BEGIN");
        await client.query(anchorFixture);
        if (caller === "forged") await client.query("SELECT set_config('staging_clean_reset_rows.binding',$1,true)", [JSON.stringify(binding())]);
        if (caller === "non-operator") {
          // The admission is held by this backend and transaction, but not by the deleting principal.
          const observed = (await client.query("SELECT staging_clean_reset_rows.observe() AS value")).rows[0].value;
          await client.query("SELECT staging_clean_reset_rows.prepare($1::jsonb,$2::jsonb)", [binding(), observed]);
          await client.query(`CREATE ROLE reset_runtime_fixture NOLOGIN; GRANT SELECT, DELETE ON diagnostic_source_anchors TO reset_runtime_fixture;
            GRANT SELECT ON diagnostic_source_commands TO reset_runtime_fixture; SET LOCAL ROLE reset_runtime_fixture`);
        }
        await expect(client.query(deleteAnchor), caller).rejects.toThrow("diagnostic_source_anchor_receipt");
        await client.query("ROLLBACK");
      }
    } finally { await client.query("ROLLBACK"); client.release(); }
  });

  it("an admission authorizes no source anchor INSERT or UPDATE", async () => {
    const client = await pool.connect();
    try {
      for (const sql of [`INSERT INTO diagnostic_source_anchors("orderId",state,source,"createdTransaction") VALUES('reset-a-order','pending','{}','1')`,
        `UPDATE diagnostic_source_anchors SET state='changed' WHERE "orderId"='reset-a-order'`]) {
        await client.query("BEGIN");
        if (sql.startsWith("UPDATE")) await client.query(anchorFixture);
        const observed = (await client.query("SELECT staging_clean_reset_rows.observe() AS value")).rows[0].value;
        await client.query("SELECT staging_clean_reset_rows.prepare($1::jsonb,$2::jsonb)", [binding(), observed]);
        await expect(client.query(sql), sql).rejects.toThrow("diagnostic_source_anchor_receipt");
        await client.query("ROLLBACK");
      }
    } finally { await client.query("ROLLBACK"); client.release(); }
  });

  it("a source anchor changed after admission no longer matches its sealed OLD tuple", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(anchorFixture);
      const observed = (await client.query("SELECT staging_clean_reset_rows.observe() AS value")).rows[0].value;
      await client.query("SELECT staging_clean_reset_rows.prepare($1::jsonb,$2::jsonb)", [binding(), observed]);
      // A post-admission change, applied with triggers off, leaves the same key under different bytes.
      await client.query(`SET LOCAL session_replication_role = replica;
        UPDATE diagnostic_source_anchors SET state='changed' WHERE "orderId"='reset-a-order'; SET LOCAL session_replication_role = origin`);
      await expect(client.query(deleteAnchor)).rejects.toThrow("operational_reset_old_tuple_changed");
    } finally { await client.query("ROLLBACK"); client.release(); }
  });

  for (const owned of ownedRows) {
    it(`the admitted full OLD ${owned.row} can be deleted before its ${owned.parent}`, async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(arranged(owned.insert));
        await admit(client);
        expect((await client.query(owned.remove)).rowCount).toBe(1);
      } finally { await client.query("ROLLBACK"); client.release(); }
    });

    it(`an ordinary, forged GUC or non-operator ${owned.row} DELETE retains the original ${owned.refusals.remove} refusal`, async () => {
      const client = await pool.connect();
      try {
        for (const caller of ["ordinary", "forged", "non-operator"] as const) {
          await client.query("BEGIN");
          await client.query(arranged(owned.insert));
          if (caller === "forged") await client.query("SELECT set_config('staging_clean_reset_rows.binding',$1,true)", [JSON.stringify(binding())]);
          if (caller === "non-operator") {
            // The admission is held by this backend and transaction, but not by the deleting principal.
            await admit(client);
            await client.query(`CREATE ROLE reset_runtime_fixture NOLOGIN; GRANT SELECT, DELETE ON ${owned.table} TO reset_runtime_fixture;
              GRANT SELECT ON ${owned.reads} TO reset_runtime_fixture; SET LOCAL ROLE reset_runtime_fixture`);
          }
          await expect(client.query(owned.remove), caller).rejects.toThrow(owned.refusals.remove);
          await client.query("ROLLBACK");
        }
      } finally { await client.query("ROLLBACK"); client.release(); }
    });

    it(`an admission authorizes no ${owned.row} INSERT or UPDATE`, async () => {
      const client = await pool.connect();
      try {
        for (const [sql, refusal] of [[owned.insert, owned.refusals.insert], [owned.change, owned.refusals.change]] as const) {
          await client.query("BEGIN");
          if (sql === owned.change) await client.query(arranged(owned.insert));
          await admit(client);
          await expect(client.query(sql), sql).rejects.toThrow(refusal);
          await client.query("ROLLBACK");
        }
      } finally { await client.query("ROLLBACK"); client.release(); }
    });

    it(`a sealed ${owned.row} changed after admission no longer matches its OLD tuple`, async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(arranged(owned.insert));
        await admit(client);
        await client.query(arranged(owned.change));
        await expect(client.query(owned.remove)).rejects.toThrow("operational_reset_old_tuple_changed");
      } finally { await client.query("ROLLBACK"); client.release(); }
    });
  }

  it("an ordinary order DELETE still cascades through each owning guard's parent-absent branch", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const owned of ownedRows) await client.query(arranged(owned.insert));
      expect((await client.query(`DELETE FROM inspection_orders WHERE id='reset-a-order'`)).rowCount).toBe(1);
      for (const { table } of ownedRows) expect({ table, rows: (await client.query(`SELECT count(*)::int AS rows FROM ${table}`)).rows[0].rows }).toEqual({ table, rows: 0 });
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

  for (const cycle of selfReferenceCycles) {
    it(`refuses a certified mutual ${cycle.name} cycle during prepare before row effects`, async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(cycle.arrange);
        const before = (await client.query(cycle.rows)).rows;
        const observed = (await client.query("SELECT staging_clean_reset_rows.observe() AS value")).rows[0].value;
        await client.query("SAVEPOINT cycle_prepare");
        await expect(client.query("SELECT staging_clean_reset_rows.prepare($1::jsonb,$2::jsonb)", [binding(),observed]))
          .rejects.toThrow("operational_reset_unsupported_cycle");
        await client.query("ROLLBACK TO SAVEPOINT cycle_prepare");
        expect((await client.query("SELECT staging_clean_reset_rows.observe() AS value")).rows[0].value).toEqual(observed);
        expect((await client.query(cycle.rows)).rows).toEqual(before);
        expect((await client.query("SELECT count(*)::int AS count FROM staging_clean_reset_rows.admissions")).rows[0].count).toBe(0);
      } finally { await client.query("ROLLBACK"); client.release(); }
    });
  }

});
