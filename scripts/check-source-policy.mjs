import { parse } from "@babel/parser";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = "scripts/source-policy/baseline.json";
const baselineText = readFileSync(join(root, baselinePath), "utf8");
const baseline = JSON.parse(baselineText);
if (baseline.version !== 1 || baseline.commit !== "48a1bba7ff6dda6bb865e1b496cf002d6019502c" ||
  baseline.tree !== "944befccc257885a3e8fa27a2fc226f907062b84") throw new Error("immutable legacy baseline changed");
const provenance = JSON.parse(readFileSync(join(root, "scripts/source-policy/provenance.json"), "utf8"));
const notices = JSON.parse(readFileSync(join(root, "scripts/source-policy/notices.json"), "utf8"));
const sourceExtension = /\.(?:[cm]?[jt]s|[jt]sx)$/i;
const digest = (value) => createHash("sha256").update(value).digest("hex");

function compilerComments(path, source) {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const accepted = new Set();
  const tags = new Set(["type", "param", "returns", "return", "typedef", "template", "satisfies", "this"]);
  const visit = (node) => {
    for (const doc of node.jsDoc ?? []) {
      const parsed = ts.parseIsolatedJSDocComment(source.slice(doc.pos, doc.end));
      if (parsed.diagnostics.length || doc.comment || !doc.tags?.length) continue;
      if (!doc.tags.every((tag) => tags.has(tag.tagName.text) && !tag.comment &&
        (tag.typeExpression || tag.tagName.text === "template" && tag.typeParameters?.length))) continue;
      const target = ts.isVariableStatement(node) && node.declarationList.declarations.length === 1 ?
        node.declarationList.declarations[0].initializer : node;
      const signature = target && ts.isFunctionLike(target) ? target : undefined;
      if (!doc.tags.every((tag) => {
        const name = tag.tagName.text;
        if (name === "typedef") return Boolean(tag.fullName);
        if (name === "template") return Boolean(signature || doc.tags.some((entry) => entry.tagName.text === "typedef"));
        if (name === "param") return signature?.parameters.some((parameter) =>
          parameter.name.getText(file) === tag.name?.getText(file).split(".")[0]);
        if (name === "this") return Boolean(signature && !ts.isArrowFunction(signature));
        if (["returns", "return"].includes(name)) return Boolean(signature);
        if (["type", "satisfies"].includes(name)) return ts.isParenthesizedExpression(node) ||
          ts.isVariableStatement(node) && node.declarationList.declarations.length === 1 &&
          (name === "type" || Boolean(node.declarationList.declarations[0].initializer));
        return false;
      })) continue;
      accepted.add(`${doc.pos}:${doc.end}`);
    }
    ts.forEachChild(node, visit);
  };
  if (/\.[cm]?jsx?$/i.test(path)) visit(file);
  return { file, accepted };
}

function comments(path, source, notices) {
  const typescript = /\.[cm]?tsx?$/i.test(path);
  const ast = parse(source, {
    sourceType: "unambiguous", tokens: true, attachComment: false,
    plugins: [...(typescript ? [["typescript", { dts: /\.d\.[cm]?ts$/i.test(path) }]] : []),
      ...(/\.[jt]sx$/i.test(path) ? ["jsx"] : []), "decorators-legacy"],
  });
  const tokens = ast.tokens.filter((token) => typeof token.type !== "string" && token.type.label !== "eof");
  let compiler;
  const list = [...ast.comments];
  if (ast.program.interpreter) list.unshift(ast.program.interpreter);
  return list.map((comment) => {
    const raw = source.slice(comment.start, comment.end);
    const next = tokens.findIndex((token) => token.start >= comment.end);
    const index = next < 0 ? tokens.length : next;
    const ownLine = !source.slice(source.lastIndexOf("\n", comment.start - 1) + 1, comment.start).trim();
    const anchor = tokens.slice(ownLine ? index : Math.max(0, index - 5), index + 5)
      .map((token) => source.slice(token.start, token.end));
    let exception = comment.type === "InterpreterDirective" && comment.start === 0 &&
      /^#!(?:\/usr\/bin\/env (?:node|tsx)|\/usr\/bin\/node)$/.test(raw);
    if (notices.some((notice) => notice.path === path && notice.tokenSha256 === digest(raw) && notice.origin)) exception = true;
    if (/^\/\/\/ <reference (?:types|path)="[^"<>\r\n]+" \/>$/.test(raw) &&
      source.slice(0, comment.start).replace(/^\/\/\/ <reference (?:types|path)="[^"<>\r\n]+" \/>\r?\n/gm, "").trim() === "") {
      compiler ??= compilerComments(path, source);
      const references = [...compiler.file.typeReferenceDirectives, ...compiler.file.referencedFiles];
      exception ||= typescript && references.some((reference) => reference.pos >= comment.start && reference.end <= comment.end);
    }
    if (raw.startsWith("/**")) {
      compiler ??= compilerComments(path, source);
      exception ||= compiler.accepted.has(`${comment.start}:${comment.end}`);
    }
    if (raw === "// @ts-check" && /\.[cm]?jsx?$/i.test(path) && !source.slice(0, comment.start).trim()) exception = true;
    return {
      start: comment.loc.start, end: comment.loc.end, raw, exception,
      identity: digest(JSON.stringify([raw, anchor])),
    };
  });
}

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

export function checkSources({ current, legacy, trusted, exclusions = [], notices = [] }) {
  const errors = [];
  const directory = mkdtempSync(join(tmpdir(), "carberk-source-policy-"));
  try {
    for (const [path, source] of current) {
      if (!sourceExtension.test(path)) continue;
      const exclusion = exclusions.find((entry) => entry.path === path);
      if (exclusion) {
        if (!exclusion.origin || digest(source) !== exclusion.sha256) errors.push(`${path}: pinned provenance bytes changed`);
        continue;
      }
      try {
        const findings = comments(path, source, notices).filter((comment) => !comment.exception);
        const originalSource = legacy.get(path) ?? "";
        const mainSource = trusted.get(path) ?? "";
        const original = comments(path, originalSource, notices).filter((comment) => !comment.exception);
        const main = comments(path, mainSource, notices).filter((comment) => !comment.exception);
        const mainLegacy = retained(originalSource, mainSource, original, main, directory);
        const allowed = new Set(retained(mainSource, source, mainLegacy, findings, directory));
        for (const finding of findings) {
          if (!allowed.has(finding)) errors.push(`${path}:${finding.start.line}:${finding.start.column + 1}: new or moved explanatory comment`);
        }
      } catch (error) {
        errors.push(`${path}: TS/JS parse or comparison failed: ${error.message}`);
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
  }).filter((entry) => sourceExtension.test(entry.path) || entry.path === baselinePath);
  const result = new Map();
  const blobs = execFileSync("git", ["cat-file", "--batch"], {
    cwd: directory, input: entries.map((entry) => entry.oid).join("\n") + "\n", maxBuffer: 128 * 1024 * 1024,
  });
  let offset = 0;
  for (const entry of entries) {
    const end = blobs.indexOf(10, offset);
    const header = blobs.subarray(offset, end).toString().split(" ");
    if (header[1] !== "blob" || !["100644", "100755"].includes(entry.mode)) throw new Error(`unsupported source mode: ${entry.path}`);
    const size = Number(header[2]);
    result.set(entry.path, blobs.subarray(end + 1, end + 1 + size).toString("utf8"));
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
  const cache = /(?:^|\/)(?:node_modules|\.git|\.turbo|\.pnpm-store|\.gradle)$|^(?:apps|packages)\/[^/]+\/(?:dist|build|coverage|\.next|\.expo)$|^packages\/db\/generated$/;
  const walk = (parent = "") => {
    for (const entry of readdirSync(join(directory, parent), { withFileTypes: true })) {
      const path = parent ? `${parent}/${entry.name}` : entry.name;
      if (cache.test(path)) continue;
      if (entry.isDirectory()) walk(path);
      else if (sourceExtension.test(path)) paths.add(path);
    }
  };
  walk();
  const result = new Map();
  for (const path of paths) {
    if (!sourceExtension.test(path)) continue;
    let info;
    try { info = lstatSync(join(directory, path)); }
    catch (error) { if (error.code === "ENOENT") continue; throw error; }
    let ancestor = directory;
    for (const part of path.split("/").slice(0, -1)) {
      ancestor = join(ancestor, part);
      if (lstatSync(ancestor).isSymbolicLink()) throw new Error(`source parent must not be a symlink: ${path}`);
    }
    if (!info.isFile()) throw new Error(`authored source must be a regular file: ${path}`);
    result.set(path, readFileSync(join(directory, path), "utf8"));
  }
  return result;
}

export function checkRepository(directory, env = process.env) {
  const ref = trustedRef(directory, env);
  const trusted = snapshot(directory, ref);
  const policy = readFileSync(join(directory, baselinePath), "utf8");
  if (policy !== baselineText || trusted.has(baselinePath) && policy !== trusted.get(baselinePath)) {
    throw new Error("immutable legacy baseline changed");
  }
  if (git(directory, "rev-parse", `${baseline.commit}^{tree}`).trim() !== baseline.tree) throw new Error("legacy snapshot tree mismatch");
  git(directory, "merge-base", "--is-ancestor", baseline.commit, ref);
  const current = workingSources(directory);
  const indexed = snapshot(directory, ":");
  if (indexed.get(baselinePath) !== baselineText) throw new Error("immutable legacy baseline must be staged unchanged");
  const legacy = snapshot(directory, baseline.commit);
  const stagedChanges = new Map([...indexed].filter(([path, source]) => current.get(path) !== source));
  return [
    ...checkSources({ current, legacy, trusted, exclusions: provenance, notices }),
    ...checkSources({ current: stagedChanges, legacy, trusted, exclusions: provenance, notices }).map((error) => `staged: ${error}`),
  ];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log("Source policy coverage: authored TS/JS only (.js/.jsx/.ts/.tsx/.mjs/.cjs/.mts/.cts), including tests, scripts and lint-ignored configuration. Other language adapters are not covered.");
  try {
    const errors = checkRepository(root);
    if (errors.length) {
      console.error(errors.join("\n"));
      process.exitCode = 1;
    } else console.log("TS/JS source policy: parser tokens, immutable legacy snapshot, trusted-current-main retention and pinned provenance pass");
  } catch (error) {
    console.error(`TS/JS source policy failed: ${error.message}`);
    process.exitCode = 1;
  }
}
