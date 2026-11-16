import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { commentSpan } from "./markup-spans.mjs";

export function parsePython({ path, source, fileType, executable = false, python = "python3" }) {
  if (fileType !== "python") throw new Error(`${path}: expected configured Python file type`);
  const run = spawnSync(python, ["-I", fileURLToPath(new URL("./python-tokenize.py", import.meta.url))], {
    input: JSON.stringify({ path, source, executable }), encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
  });
  if (run.error || run.status !== 0) throw new Error(`${path}: Python parse failed: ${run.error?.message ?? run.stderr.trim()}`);
  return { comments: JSON.parse(run.stdout).map((item) =>
    commentSpan(source, item.startOffset, item.endOffset, item.exception)), deferred: [] };
}
