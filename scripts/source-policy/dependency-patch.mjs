import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { javascriptComments } from "./javascript.mjs";
import { commentSpan } from "./markup-spans.mjs";

const apiDependencies = fileURLToPath(new URL("../../apps/api/node_modules/", import.meta.url));
const packagePatch = /^patches\/([\w-]+)@(\d+\.\d+\.\d+)\.patch$/;
const header = /^diff --git a\/((?:[\w-]+\/)*[\w.-]+\.mjs) b\/\1\nindex ([a-f0-9]{40})\.\.([a-f0-9]{40}) 100644\n--- a\/\1\n\+\+\+ b\/\1\n/;
const range = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: .*)?$/;

function readInstalledSource(path, target) {
  const [, name, version] = path.match(packagePatch) ?? [];
  if (!name) throw new Error("Expected a versioned API dependency patch");
  const installed = join(apiDependencies, name);
  const manifest = JSON.parse(readFileSync(join(installed, "package.json"), "utf8"));
  if (manifest.name !== name || manifest.version !== version) throw new Error("Install the patched dependency version");
  return readFileSync(join(installed, target), "utf8");
}

function blobId(text) {
  return createHash("sha1").update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest("hex");
}

export function parseDependencyPatch({ path, source, readDependency = readInstalledSource }) {
  const [prefix, target, originalId, patchedId] = source.match(header) ?? [];
  if (!target || !source.endsWith("\n")) throw new Error("Expected one unified JavaScript dependency patch with full blob IDs");
  const patched = readDependency(path, target);
  if (blobId(patched) !== patchedId) throw new Error("Install the exact patched JavaScript source before checking policy");
  const trailingNewline = patched.endsWith("\n") ? "\n" : "";
  const lines = (trailingNewline ? patched.slice(0, -1) : patched).split("\n");
  const original = [];
  const originalLines = [];
  const patchLines = new Map();
  let index = 0;
  let offset = prefix.length;
  let beforeRemaining = 0;
  let afterRemaining = 0;
  let inHunk = false;

  function copyUnchangedLine() {
    originalLines[index] = original.length;
    original.push(lines[index++]);
  }

  for (const line of source.slice(prefix.length, -1).split("\n")) {
    const hunk = line.match(range);
    if (hunk) {
      if (beforeRemaining || afterRemaining) throw new Error("Incomplete JavaScript patch hunk");
      beforeRemaining = Number(hunk[2] ?? 1);
      afterRemaining = Number(hunk[4] ?? 1);
      const start = Number(hunk[3]) - Number(afterRemaining > 0);
      if (start < index || start > lines.length) throw new Error("Invalid JavaScript patch range");
      while (index < start) copyUnchangedLine();
      if (original.length !== Number(hunk[1]) - Number(beforeRemaining > 0)) throw new Error("Invalid original JavaScript patch range");
      inHunk = true;
    } else {
      const operation = line[0];
      const code = line.slice(1);
      if (!inHunk || ![" ", "+", "-"].includes(operation)) throw new Error("Invalid JavaScript patch hunk");
      if (operation !== "+") beforeRemaining--;
      if (operation !== "-") {
        afterRemaining--;
        if (code !== lines[index]) throw new Error("JavaScript patch differs from the installed source");
        patchLines.set(index + 1, { start: offset + 1, end: offset + line.length });
      }
      if (beforeRemaining < 0 || afterRemaining < 0) throw new Error("JavaScript patch hunk exceeds its range");
      if (operation === " ") copyUnchangedLine();
      else if (operation === "+") index++;
      else original.push(code);
    }
    offset += line.length + 1;
  }
  if (!inHunk || beforeRemaining || afterRemaining) throw new Error("Incomplete JavaScript patch hunk");
  while (index < lines.length) copyUnchangedLine();
  const before = original.join("\n") + trailingNewline;
  if (blobId(before) !== originalId) throw new Error("JavaScript patch does not reconstruct its original source");

  const key = (start, end, raw) => JSON.stringify([start.line, start.column, end.line, end.column, raw]);
  const existing = new Set(javascriptComments(target, before).map(({ start, end, raw }) => key(start, end, raw)));
  const comments = [];
  for (const { start, end, raw } of javascriptComments(target, patched)) {
    const old = originalLines[start.line - 1];
    const unchanged = old !== undefined && Array.from({ length: end.line - start.line + 1 }, (_, i) => i)
      .every((i) => originalLines[start.line - 1 + i] === old + i);
    if (unchanged && existing.has(key({ ...start, line: old + 1 }, { ...end, line: old + end.line - start.line + 1 }, raw))) continue;
    const opening = patchLines.get(start.line);
    const span = opening ?? patchLines.values().next().value;
    const startOffset = opening ? opening.start + start.column : span?.start ?? prefix.length;
    comments.push(commentSpan(source, startOffset, span?.end ?? prefix.length));
  }
  return { comments, deferred: [] };
}
