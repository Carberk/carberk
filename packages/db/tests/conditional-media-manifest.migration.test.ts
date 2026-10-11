import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const MIGRATION = "20261011150000_expand_conditional_media_manifest";
const migrationsDir = new URL("../prisma/migrations", import.meta.url).pathname;
const migrations = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const webpManifest = ["original.webp", "thumb.webp", "small.webp", "medium.webp", "large.webp"];
const oldManifest = [
  "original.jpg", "thumb.jpg", "thumb.webp", "small.jpg", "small.webp",
  "medium.jpg", "medium.webp", "large.jpg", "large.webp",
];

for (const populated of [true, false]) {
  describe(`conditional manifests in a ${populated ? "populated" : "fresh"} database`, () => {
    let container: StartedPostgreSqlContainer;
    let db: Client;
    let before: unknown[];

    async function apply(names: string[]): Promise<void> {
      for (const name of names) {
        await db.query(readFileSync(join(migrationsDir, name, "migration.sql"), "utf8"));
      }
    }

    async function insertUpload(
      id: string,
      objects: string[],
      kind = "image",
      protocol = "conditional-v1",
      original = objects[0] ?? "original.webp",
    ): Promise<void> {
      await db.query(
        `INSERT INTO media_uploads (id, "userId", key, kind, "contentType", "writeProtocol", "objectKeys")
         VALUES ($1, 'manifest-user', $2, $3::"MediaKind", 'image/webp', $4, $5::text[])`,
        [id, `${id}/${original}`, kind, protocol, objects.map((object) => `${id}/${object}`)],
      );
    }

    async function snapshot(): Promise<unknown[]> {
      const results = await Promise.all([
        db.query("SELECT * FROM media_uploads ORDER BY id"),
        db.query("SELECT * FROM users ORDER BY id"),
        db.query('SELECT * FROM media_upload_cleanups ORDER BY "uploadId"'),
      ]);
      return results.map((result) => result.rows);
    }

    beforeAll(async () => {
      container = await new PostgreSqlContainer("postgres:16-alpine")
        .withUsername("auto_tm")
        .withPassword("auto_tm_pass")
        .withDatabase("auto_tm_test")
        .start();
      db = new Client({ connectionString: container.getConnectionUri() });
      await db.connect();
      await apply(migrations.filter((name) => name < MIGRATION));
      if (populated) {
        await db.query(`INSERT INTO users (id, "updatedAt") VALUES ('manifest-user', now())`);
        await insertUpload("old-adopted", oldManifest);
        await insertUpload("old-retired", oldManifest);
        await insertUpload("legacy-upload", [], "video", "legacy", "original.mp4");
        await db.query(`UPDATE media_uploads SET state = 'ADOPTED', "claimTargetType" = 'profile',
          "claimTargetId" = 'manifest-user' WHERE id = 'old-adopted'`);
        await db.query(`UPDATE users SET "avatarUploadId" = 'old-adopted',
          "avatarKey" = 'old-adopted/original.jpg' WHERE id = 'manifest-user'`);
        await db.query(`UPDATE media_uploads SET state = 'RETIRED', "retiredAt" = now()
          WHERE id = 'old-retired'`);
        await db.query(`INSERT INTO media_upload_cleanups ("uploadId", key, "objectKeys", "writeProtocol", attempts, "lastError")
          SELECT id, key, "objectKeys", "writeProtocol", 2, 'retry pending'
          FROM media_uploads WHERE id = 'old-retired'`);
        before = await snapshot();
      }
      // The red checkpoint has no expansion migration: real inserts exercise the old check.
      await apply(migrations.filter((name) => name >= MIGRATION));
      if (!populated) {
        await db.query(`INSERT INTO users (id, "updatedAt") VALUES ('manifest-user', now())`);
      }
    }, 120_000);

    afterAll(async () => {
      await db?.end();
      await container?.stop();
    });

    if (populated) {
      it("preserves existing uploads, Profile Photo adopter and pending cleanup without rewriting rows", async () => {
        expect(await snapshot()).toEqual(before);
      });
    }

    it.each([
      ["five-object WebP", webpManifest],
      ["nine-object existing", oldManifest],
    ])("accepts the %s conditional image manifest", async (_label, objects) => {
      const id = randomUUID();
      await insertUpload(id, objects);
      const result = await db.query('SELECT "objectKeys", "writeProtocol" FROM media_uploads WHERE id = $1', [id]);
      expect(result.rows).toEqual([{
        objectKeys: objects.map((object) => `${id}/${object}`),
        writeProtocol: "conditional-v1",
      }]);
    });

    it.each([0, 1, 4, 6, 8, 10])("refuses a conditional manifest containing %i objects", async (count) => {
      await expect(insertUpload(randomUUID(), Array.from({ length: count }, (_, i) => `object-${i}.webp`)))
        .rejects.toThrow("media_uploads_conditional_manifest_check");
    });

    it.each([[webpManifest], [oldManifest]])("refuses conditional video and missing original membership for %j", async (objects) => {
      await expect(insertUpload(randomUUID(), objects, "video"))
        .rejects.toThrow("media_uploads_conditional_manifest_check");
      await expect(insertUpload(randomUUID(), objects, "image", "conditional-v1", "missing.webp"))
        .rejects.toThrow("media_uploads_conditional_manifest_check");
    });

    it("retains the protocol allowlist and legacy exemption", async () => {
      await expect(insertUpload(randomUUID(), webpManifest, "image", "future-protocol"))
        .rejects.toThrow("media_uploads_write_protocol_check");
      await insertUpload(randomUUID(), [], "video", "legacy", "original.mp4");
    });
  });
}
