import { execFileSync } from "node:child_process";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSql } from "./sql.mjs";

const directoryPath = "packages/db/prisma/migrations";
const migrationPath = /^packages\/db\/prisma\/migrations\/[^/]+\/migration\.sql$/;

export function checkMigrations({ current, trusted }) {
  const errors = [];
  for (const [path, bytes] of trusted) {
    if (migrationPath.test(path) && (!current.has(path) || !bytes.equals(current.get(path)))) {
      errors.push(`${path}: immutable migration bytes changed or missing`);
    }
  }
  for (const [path, bytes] of current) {
    if (!migrationPath.test(path) || trusted.has(path)) continue;
    try {
      const source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
      const result = parseSql({ path, source, fileType: "sql" });
      for (const comment of result.comments) errors.push(`${path}:${comment.start.line}:${comment.start.column + 1}: new migration explanatory comment`);
      for (const item of result.deferred) errors.push(`${path}: ${item.reason}`);
    } catch (error) {
      errors.push(`${path}: new migration check failed: ${error.message}`);
    }
  }
  return errors;
}

export function checkMigrationRepository(directory, ref) {
  const git = (...args) => execFileSync("git", args, { cwd: directory, maxBuffer: 32 * 1024 * 1024 });
  const snapshot = (index) => {
    const entries = git(...(index ? ["ls-files", "--stage", "-z"] : ["ls-tree", "-rz", ref]), "--", directoryPath).toString().split("\0").filter(Boolean);
    return new Map(entries.flatMap((entry) => {
      const [metadata, path] = entry.split("\t");
      if (!migrationPath.test(path)) return [];
      const [mode, object, stage] = metadata.split(" ");
      if (index && stage !== "0" || !["100644", "100755"].includes(mode)) throw new Error(`${path}: unsupported migration index or mode`);
      return [[path, git("cat-file", "blob", index ? object : stage)]];
    }));
  };
  const trusted = snapshot(false);
  const indexed = snapshot(true);
  const current = new Map();
  const walk = (path) => {
    let stat;
    try { stat = lstatSync(join(directory, path)); }
    catch (error) { if (error.code === "ENOENT") return; throw error; }
    if (stat.isSymbolicLink()) throw new Error(`${path}: migration must not be a symlink`);
    if (stat.isDirectory()) for (const child of readdirSync(join(directory, path))) walk(`${path}/${child}`);
    else if (migrationPath.test(path)) {
      if (!stat.isFile()) throw new Error(`${path}: migration must be a regular file`);
      current.set(path, readFileSync(join(directory, path)));
    }
  };
  for (const path of ["packages", "packages/db", "packages/db/prisma"]) {
    try { if (lstatSync(join(directory, path)).isSymbolicLink()) throw new Error(`${path}: migration parent must not be a symlink`); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  walk(directoryPath);
  return [...checkMigrations({ current, trusted }), ...checkMigrations({ current: indexed, trusted }).map((error) => `staged: ${error}`)];
}
