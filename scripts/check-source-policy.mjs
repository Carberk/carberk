import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectSource, sourceType } from "./source-policy/index.mjs";
import { commentSpan } from "./source-policy/markup-spans.mjs";
import { producerProvenance } from "./source-policy/producers.mjs";
import { checkMigrationRepository } from "./source-policy/migrations.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = "scripts/source-policy/baseline.json";
const baselineText = readFileSync(join(root, baselinePath), "utf8");
const baseline = JSON.parse(baselineText);
if (baseline.version !== 1 || baseline.commit !== "48a1bba7ff6dda6bb865e1b496cf002d6019502c" ||
  baseline.tree !== "944befccc257885a3e8fa27a2fc226f907062b84") throw new Error("immutable legacy baseline changed");

const digest = (value) => createHash("sha256").update(value).digest("hex");
const policyManifests = new Map([
  ["scripts/source-policy/notices.json", "37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570"],
  ["scripts/source-policy/provenance.json", "60d764e6be2419746107549246442ecb6dc2d6c95fead216d02aefe45b4a170c"],
]);

function unchangedLines(before, after, directory) {
  if (before === after) return (line) => line;
  const left = join(directory, "before");
  const right = join(directory, "after");
  writeFileSync(left, before);
  writeFileSync(right, after);
  const diff = spawnSync("git", ["diff", "--no-index", "--no-ext-diff", "--no-textconv", "--text", "--unified=0", "--diff-algorithm=myers", "--", left, right], {
    encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
  });
  if (diff.error || ![0, 1].includes(diff.status)) throw new Error(`line comparison failed: ${diff.error?.message ?? diff.stderr}`);
  const hunks = [...diff.stdout.matchAll(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm)]
    .map(([, oldStart, oldCount = "1", newStart, newCount = "1"]) => ({
      oldStart: Number(oldStart), oldCount: Number(oldCount), newStart: Number(newStart), newCount: Number(newCount),
    }));
  return (line) => {
    let offset = 0;
    for (const hunk of hunks) {
      if (hunk.newCount && line >= hunk.newStart && line < hunk.newStart + hunk.newCount) return undefined;
      if (line < hunk.newStart + (hunk.newCount ? 0 : 1)) break;
      offset = hunk.oldStart + hunk.oldCount + (hunk.oldCount ? 0 : 1) -
        hunk.newStart - hunk.newCount - (hunk.newCount ? 0 : 1);
    }
    return line + offset;
  };
}

function retained(beforeSource, afterSource, beforeComments, afterComments, directory) {
  if (!beforeComments.length || !afterComments.length) return [];
  const line = unchangedLines(beforeSource, afterSource, directory);
  const available = new Map(beforeComments.map((comment) => [
    `${comment.start.line}:${comment.start.column}:${comment.end.line}:${comment.end.column}:${comment.identity}`, comment,
  ]));
  return afterComments.filter((comment) => {
    for (let current = comment.start.line; current <= comment.end.line; current++) {
      if (line(current) !== line(comment.start.line) + current - comment.start.line) return false;
    }
    return available.delete(`${line(comment.start.line)}:${comment.start.column}:${line(comment.end.line)}:${comment.end.column}:${comment.identity}`);
  });
}

export function checkSources({ current, legacy, trusted, exclusions = [], notices = [], report = {}, readDependency }) {
  const errors = [];
  report.coverage ??= {};
  report.files ??= [];
  report.legacyComments ??= [];
  report.deferred ??= [];
  report.exclusions ??= [];
  const directory = mkdtempSync(join(tmpdir(), "carberk-source-policy-"));
  const parsedSources = new Map();
  const findings = (path, source) => {
    if (!parsedSources.has(path)) parsedSources.set(path, new Map());
    const cache = parsedSources.get(path);
    if (cache.has(source)) return cache.get(source);
    const parsed = inspectSource(path, source, notices, readDependency);
    const result = { ...parsed, comments: parsed.comments.filter((comment) => !comment.exception),
      deferred: parsed.deferred.map((item) => ({ ...commentSpan(source, item.startOffset, item.endOffset),
        identity: digest(JSON.stringify([item.fileType, item.reason, source.slice(item.startOffset, item.endOffset)])),
        reason: item.reason, fileType: item.fileType })) };
    cache.set(source, result);
    return result;
  };
  try {
    for (const [path, source] of current) {
      report.files.push({ path, fileType: sourceType(path) });
      if (path === ".agents/skills" && source === "../.claude/skills") {
        report.exclusions.push({ path, kind: "skill-discovery symlink", sha256: digest(source) });
        continue;
      }
      const migration = /^packages\/db\/prisma\/migrations\/[^/]+\/migration\.sql$/.test(path);
      const immutable = legacy.has(path) && (/^docs\/adr\/\d{4}-.+\.md$/.test(path) ||
        /^patches\/[^/]+\.patch$/.test(path) || /^apps\/phone-agent\/gradlew(?:\.bat)?$/.test(path) ||
        path === ".claude/skills/THIRD-PARTY-NOTICES.md" || path === "apps/phone-agent/gradle/wrapper/gradle-wrapper.jar");
      if (migration && trusted.has(path) || immutable) {
        const expected = (immutable ? legacy : trusted).get(path);
        if (Buffer.isBuffer(source) ? !Buffer.isBuffer(expected) || !source.equals(expected) : source !== expected) errors.push(`${path}: immutable history/upstream/migration bytes changed`);
        report.exclusions.push({ path, kind: migration ? "applied-migration" : "history/upstream/legal", sha256: digest(source) });
        continue;
      }
      const pins = exclusions.filter((entry) => entry.path === path);
      if (pins.length) {
        const hash = digest(source);
        if (!pins.some((entry) => entry.origin && hash === entry.sha256)) errors.push(`${path}: pinned provenance bytes changed`);
        report.exclusions.push({ path, kind: "generated", sha256: hash, origin: pins.find((entry) => entry.sha256 === hash)?.origin });
        continue;
      }
      try {
        const parsed = findings(path, source);
        report.coverage[parsed.fileType ?? "empty"] = (report.coverage[parsed.fileType ?? "empty"] ?? 0) + 1;
        const originalSource = legacy.get(path) ?? "";
        const mainSource = trusted.get(path) ?? "";
        const original = legacy.has(path) ? findings(path, originalSource) : { comments: [], deferred: [] };
        const main = legacy.has(path) && trusted.has(path) ? findings(path, mainSource) : { comments: [], deferred: [] };
        for (const kind of ["comments", "deferred"]) {
          const mainLegacy = retained(originalSource, mainSource, original[kind], main[kind], directory);
          const allowed = new Set(retained(mainSource, source, mainLegacy, parsed[kind], directory));
          for (const finding of parsed[kind]) {
            if (!allowed.has(finding)) {
              errors.push(`${path}:${finding.start.line}:${finding.start.column + 1}: ${kind === "comments" ?
                "new or moved explanatory comment" : `unsupported ${finding.fileType}: ${finding.reason}`}`);
            } else if (kind === "comments") report.legacyComments.push({ path, fileType: parsed.fileType, start: finding.start, end: finding.end, raw: finding.raw });
            else report.deferred.push({ path, start: finding.start, end: finding.end, language: finding.fileType, reason: finding.reason });
          }
        }
      } catch (error) {
        errors.push(`${path}: parse or comparison failed: ${error.message}`);
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  return errors;
}

function git(directory, ...args) {
  return execFileSync("git", args, { cwd: directory, encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
}

function snapshot(directory, ref) {
  const entries = (ref === ":" ? git(directory, "ls-files", "--stage", "-z") : git(directory, "ls-tree", "-rz", ref)).split("\0").filter(Boolean).map((entry) => {
    const [metadata, path] = entry.split("\t");
    const fields = metadata.split(" ");
    if (ref === ":" && fields[2] !== "0") throw new Error(`unmerged source index: ${path}`);
    return { path, mode: fields[0], oid: fields[ref === ":" ? 1 : 2] };
  });
  const result = new Map();
  const blobs = execFileSync("git", ["cat-file", "--batch"], {
    cwd: directory, input: entries.map((entry) => entry.oid).join("\n") + "\n", maxBuffer: 128 * 1024 * 1024,
  });
  let offset = 0;
  for (const entry of entries) {
    const end = blobs.indexOf(10, offset);
    const header = blobs.subarray(offset, end).toString().split(" ");
    if (header[1] !== "blob" || !["100644", "100755"].includes(entry.mode) && !(entry.mode === "120000" && entry.path === ".agents/skills")) throw new Error(`unsupported source mode: ${entry.path}`);
    const size = Number(header[2]);
    const bytes = blobs.subarray(end + 1, end + 1 + size);
    result.set(entry.path, sourceType(entry.path).startsWith("asset:") ? bytes : bytes.toString("utf8"));
    offset = end + 1 + size + 1;
  }
  return result;
}

function trustedRef(directory, env) {
  let ref = "refs/remotes/origin/main";
  if (env.GITHUB_ACTIONS === "true") {
    const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8"));
    ref = env.GITHUB_EVENT_NAME === "pull_request" && event.pull_request?.base?.ref === "main" ? event.pull_request.base.sha :
      env.GITHUB_EVENT_NAME === "push" && event.ref === "refs/heads/main" ? event.before : undefined;
    if (!/^[a-f0-9]{40}$/.test(ref ?? "") || /^0+$/.test(ref)) throw new Error("missing trusted current-main source-policy comparison");
  }
  return git(directory, "rev-parse", "--verify", `${ref}^{commit}`).trim();
}

function workingSources(directory) {
  const paths = new Set(git(directory, "ls-files", "-z").split("\0").filter(Boolean));
  const cache = /(?:^|\/)(?:node_modules|\.git|\.turbo|\.pnpm-store|\.gradle)$/;
  const walk = (parent = "") => {
    for (const entry of readdirSync(join(directory, parent), { withFileTypes: true })) {
      const path = parent ? `${parent}/${entry.name}` : entry.name;
      if (cache.test(path)) continue;
      if (entry.isDirectory()) walk(path);
      else paths.add(path);
    }
  };
  walk();
  const result = new Map();
  for (const path of paths) {
    let info;
    try { info = lstatSync(join(directory, path)); }
    catch (error) { if (error.code === "ENOENT") continue; throw error; }
    let ancestor = directory;
    for (const part of path.split("/").slice(0, -1)) {
      ancestor = join(ancestor, part);
      if (lstatSync(ancestor).isSymbolicLink()) throw new Error(`source parent must not be a symlink: ${path}`);
    }
    if (path === ".agents/skills" && info.isSymbolicLink() && readlinkSync(join(directory, path)) === "../.claude/skills") { result.set(path, "../.claude/skills"); continue; }
    if (!info.isFile()) throw new Error(`authored source must be a regular file: ${path}`);
    result.set(path, readFileSync(join(directory, path), sourceType(path).startsWith("asset:") ? undefined : "utf8"));
  }
  return result;
}

export function checkRepository(directory, env = process.env, report = {}) {
  const ref = trustedRef(directory, env);
  report.admission = env.GITHUB_ACTIONS === "true" ? "committed HEAD and index" : "working tree, index, untracked and ignored files outside installed dependency and tool caches";
  const trusted = snapshot(directory, ref);
  const policy = readFileSync(join(directory, baselinePath), "utf8");
  if (policy !== baselineText || trusted.has(baselinePath) && policy !== trusted.get(baselinePath)) {
    throw new Error("immutable legacy baseline changed");
  }
  if (git(directory, "rev-parse", `${baseline.commit}^{tree}`).trim() !== baseline.tree) throw new Error("legacy snapshot tree mismatch");
  git(directory, "merge-base", "--is-ancestor", baseline.commit, ref);
  const current = env.GITHUB_ACTIONS === "true" ? snapshot(directory, "HEAD") : workingSources(directory);
  const indexed = snapshot(directory, ":");
  if (indexed.get(baselinePath) !== baselineText) throw new Error("immutable legacy baseline must be staged unchanged");
  const manifests = new Map();
  for (const [path, hash] of policyManifests) {
    const text = readFileSync(join(directory, path), "utf8");
    if (digest(text) !== hash || indexed.get(path) !== text) throw new Error(`immutable source-policy manifest changed: ${path}`);
    manifests.set(path, JSON.parse(text));
  }
  const notices = manifests.get("scripts/source-policy/notices.json");
  const provenance = manifests.get("scripts/source-policy/provenance.json");
  const legacy = snapshot(directory, baseline.commit);
  const producers = env.GITHUB_ACTIONS === "true" ? [] : producerProvenance(directory, current, trusted);
  const stagedChanges = new Map([...indexed].filter(([path, source]) => Buffer.isBuffer(source) ? !Buffer.isBuffer(current.get(path)) || !source.equals(current.get(path)) : current.get(path) !== source));
  return [
    ...checkMigrationRepository(directory, ref),
    ...checkSources({ current, legacy, trusted, exclusions: [...provenance, ...producers], notices, report }),
    ...checkSources({ current: stagedChanges, legacy, trusted, exclusions: [...provenance, ...producers], notices }).map((error) => `staged: ${error}`),
  ];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = {};
  try {
    const errors = checkRepository(root, process.env, report);
    if (process.argv.includes("--json")) console.log(JSON.stringify({ ...report, errors }));
    else {
      console.log(`Source policy admission: ${report.admission}; ${report.files.length} paths inventoried`);
      console.log(`Source policy coverage: ${JSON.stringify(report.coverage)}`);
      console.log(`Legacy explanatory comments retained: ${report.legacyComments?.length ?? 0}; immutable exclusions: ${report.exclusions?.length ?? 0}`);
      console.log(`Legacy unsupported spans retained: ${report.deferred?.length ?? 0}`);
      console.log(`Legacy unsupported languages: ${JSON.stringify(Object.fromEntries([...new Set(report.deferred.map((item) => item.language))].map((language) => [language, report.deferred.filter((item) => item.language === language).length])))}`);
      console.log("Full path/token inventory: pnpm check:source-policy --json");
    }
    if (errors.length) {
      console.error(errors.join("\n"));
      process.exitCode = 1;
    } else if (!process.argv.includes("--json")) console.log("Source policy: new source/comment admission and decreasing legacy retention pass; retained unsupported spans remain disclosed");
  } catch (error) {
    console.error(`Source policy failed: ${error.message}`);
    process.exitCode = 1;
  }
}
