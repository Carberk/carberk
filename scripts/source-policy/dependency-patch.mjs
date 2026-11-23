import { javascriptComments } from "./javascript.mjs";
import { commentSpan } from "./markup-spans.mjs";

const header = /^diff --git a\/((?:[\w-]+\/)*[\w.-]+\.mjs) b\/\1\nindex [a-f0-9]+\.\.[a-f0-9]+ 100644\n--- a\/\1\n\+\+\+ b\/\1\n/;
const range = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@(?: .*)?$/;

export function parseDependencyPatch({ source }) {
  const prefix = source.match(header)?.[0];
  if (!prefix || !source.endsWith("\n")) throw new Error("Expected one unified JavaScript dependency patch");
  const comments = [];
  let additions = [];
  let original = 0;
  let revised = 0;
  let hunks = 0;
  let offset = prefix.length;

  function inspectAddedStatements() {
    if (additions.length === 0) return;
    const statements = additions.map(({ code }) => code).join("\n");
    for (const { start, end } of javascriptComments("dependency-patch.mjs", `async function patch() {\n${statements}\n}\n`)) {
      comments.push(commentSpan(source, additions[start.line - 2].offset + start.column,
        additions[end.line - 2].offset + end.column));
    }
    additions = [];
  }

  for (const line of source.slice(prefix.length, -1).split("\n")) {
    const hunk = line.match(range);
    if (hunk) {
      inspectAddedStatements();
      if (original !== 0 || revised !== 0) throw new Error("Incomplete JavaScript patch hunk");
      original = Number(hunk[1] ?? 1);
      revised = Number(hunk[2] ?? 1);
      hunks++;
    } else {
      const operation = line[0];
      if (!hunks || ![" ", "+", "-"].includes(operation)) throw new Error("Invalid JavaScript patch hunk");
      if (operation !== "+") original--;
      if (operation !== "-") revised--;
      if (original < 0 || revised < 0) throw new Error("JavaScript patch hunk exceeds its range");
      if (operation === "+") additions.push({ code: line.slice(1), offset: offset + 1 });
      else inspectAddedStatements();
    }
    offset += line.length + 1;
  }
  inspectAddedStatements();
  if (!hunks || original !== 0 || revised !== 0) throw new Error("Incomplete JavaScript patch hunk");
  return { comments, deferred: [] };
}
