import assert from "node:assert/strict";
import test from "node:test";
import { checkMigrationRepository, checkMigrations } from "./source-policy/migrations.mjs";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const path = "packages/db/prisma/migrations/20261116000000_test/migration.sql";
const files = (value) => new Map(value === undefined ? [] : [[path, Buffer.from(value)]]);

test("trusted migration bytes are immutable and never reinterpreted as new source", () => {
  const trusted = files("-- applied\r\nSELECT 1;\r\n");
  assert.deepEqual(checkMigrations({ current: files("-- applied\r\nSELECT 1;\r\n"), trusted }), []);
  for (const current of [files("-- applied\nSELECT 1;\n"), files("SELECT 1;\r\n"), files(),
    new Map([[path.replace("test", "renamed"), Buffer.from("-- applied\r\nSELECT 1;\r\n")]])]) {
    assert.match(checkMigrations({ current, trusted }).join("\n"), /immutable migration/);
  }
});

test("new migration source is parsed and rejected before it can become history", () => {
  assert.deepEqual(checkMigrations({ current: files("COMMENT ON TABLE users IS '-- metadata';"), trusted: files() }), []);
  for (const source of ["-- new\nSELECT 1;", "/* outer /* inner */ end */ SELECT 1;", "SELECT (",
    'SET "STANDARD_CONFORMING_STRINGS" = off;',
    "SELECT pg_catalog.set_config('standard_conforming_strings', 'off', false);"]) {
    assert.ok(checkMigrations({ current: files(source), trusted: files() }).length);
  }
  assert.match(checkMigrations({ current: new Map([[path, Buffer.from([0xff])]]), trusted: files() }).join("\n"), /check failed/);
});

test("migration repository admission checks working files and index against trusted Git bytes", () => {
  const directory = mkdtempSync(join(tmpdir(), "carberk-migrations-"));
  const git = (...args) => execFileSync("git", args, { cwd: directory, encoding: "utf8" });
  const write = (name, bytes) => { mkdirSync(dirname(join(directory, name)), { recursive: true }); writeFileSync(join(directory, name), bytes); };
  try {
    git("init", "-q");
    git("config", "user.name", "Fixture");
    git("config", "user.email", "fixture@example.test");
    write(path, "-- applied\r\nSELECT 1;\r\n");
    git("add", ".");
    git("commit", "-qm", "trusted migration");
    const ref = git("rev-parse", "HEAD").trim();
    assert.deepEqual(checkMigrationRepository(directory, ref), []);
    write(path, "SELECT 1;\n");
    assert.match(checkMigrationRepository(directory, ref).join("\n"), /immutable migration/);
    git("add", ".");
    write(path, "-- applied\r\nSELECT 1;\r\n");
    assert.match(checkMigrationRepository(directory, ref).join("\n"), /staged:.*immutable migration/);
    git("add", ".");
    const added = path.replace("test", "new");
    write(added, "-- new explanation\nSELECT 2;");
    assert.match(checkMigrationRepository(directory, ref).join("\n"), /new migration explanatory comment/);
    git("add", ".");
    write(added, "SELECT 2;");
    assert.match(checkMigrationRepository(directory, ref).join("\n"), /staged:.*new migration explanatory comment/);
    git("add", ".");
    assert.deepEqual(checkMigrationRepository(directory, ref), []);
    renameSync(dirname(join(directory, path)), dirname(join(directory, path.replace("test", "renamed"))));
    assert.match(checkMigrationRepository(directory, ref).join("\n"), /immutable migration/);
    rmSync(join(directory, added));
    symlinkSync("elsewhere.sql", join(directory, added));
    assert.throws(() => checkMigrationRepository(directory, ref), /must not be a symlink/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
