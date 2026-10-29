// Offline self-test of the inline migration pin in both fixture scripts. No database, no services.
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
const hash = v => createHash("sha256").update(v).digest("hex");
const manifestPath = resolve("docs/evidence/issue-897/worker-fresh-ready-20261029/migration-manifest.json");
const bytes = await readFile(manifestPath), good = { manifestPath, manifestSha256: hash(bytes) };
const rows = JSON.parse(bytes).migrations;
const results = [];
for (const file of ["bootstrapOwnershipExpiryFixture.mjs", "produceOwnershipExpiryFixture.mjs"]) {
  const source = await readFile(resolve("apps/worker/src/jobs/diagnostics/testing", file), "utf8");
  const start = source.indexOf("const pinnedMigrations"), end = source.indexOf("\n};\n", start) + 4;
  const make = new Function("hash", "readFile", "readdir", "resolve", "join", "config", `${source.slice(start, end)}\nreturn pinnedMigrations;`);
  const call = async (pin, r) => { const fn = make(hash, readFile, readdir, resolve, join, { migrationPin: pin }); return fn.length === 2 ? fn(r, pin) : fn(r); };
  const attempt = async (name, pin, r, expectOk) => {
    let ok = true, message = "";
    try { await call(pin, r); } catch (error) { ok = false; message = String(error.message); }
    results.push({ file, name, expectOk, ok, pass: ok === expectOk, message });
  };
  await attempt("exact", good, rows, true);
  await attempt("db row checksum changed", good, rows.map((r, i) => i === 101 ? { ...r, checksum: "0".repeat(64) } : r), false);
  await attempt("db missing newest", good, rows.slice(0, 101), false);
  await attempt("db extra row", good, [...rows, { migration_name: "99999999999999_x", checksum: "1".repeat(64) }], false);
  await attempt("manifest hash wrong", { ...good, manifestSha256: "2".repeat(64) }, rows, false);
  await attempt("no pin", undefined, rows, false);
}
console.log(JSON.stringify(results, null, 1));
process.exitCode = results.every(r => r.pass) ? 0 : 1;
