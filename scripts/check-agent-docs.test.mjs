import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { checkAgentDocs } from "./check-agent-docs.mjs";

function fixture(change, verify) {
  const root = mkdtempSync(join(tmpdir(), "autotm-agent-docs-"));
  const files = {
    "AGENTS.md": "# Rules\n[Domain](docs/agents/domain.md#authority)\n",
    "CLAUDE.md": "[Shared policy](AGENTS.md)\n\n@AGENTS.md\n",
    "CONTEXT-MAP.md": "[API](apps/api/CONTEXT.md)\n",
    "apps/api/CONTEXT.md": "# API\n[Source](src/(group)/handler.ts)\n",
    "apps/api/src/(group)/handler.ts": "",
    "docs/agents/domain.md": "# Domain\n## Authority\n",
  };
  change(files);
  try {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    verify(checkAgentDocs(root, Object.keys(files)));
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test("accepts routed guidance and route-group source links", () => fixture(() => {}, (errors) => assert.deepEqual(errors, [])));
test("finds missing guidance targets", () => fixture((files) => { delete files["docs/agents/domain.md"]; }, (errors) => assert.match(errors.join("\n"), /missing link target/)));
test("finds renamed headings", () => fixture((files) => { files["docs/agents/domain.md"] = "# Domain\n## Renamed\n"; }, (errors) => assert.match(errors.join("\n"), /missing heading/)));
test("requires context discovery through the map", () => fixture((files) => { files["CONTEXT-MAP.md"] = "# Map\n"; }, (errors) => assert.match(errors.join("\n"), /omits apps\/api\/CONTEXT.md/)));
test("requires Claude to load the shared policy", () => fixture((files) => { files["CLAUDE.md"] = "[Shared policy](AGENTS.md)\n"; }, (errors) => assert.match(errors.join("\n"), /must import and link/)));
test("ignores fenced examples and remote links, checks encoded local paths", () => fixture((files) => {
  files["AGENTS.md"] += '\n```md\n[example](missing.md)\n```\n[Website](https://example.com)\n[Notes](docs/agents/my%20notes.md)\n';
  files["docs/agents/my notes.md"] = "# Notes\n";
}, (errors) => assert.deepEqual(errors, [])));
test("reports missing root entry points", () => fixture((files) => { delete files["CLAUDE.md"]; }, (errors) => assert.match(errors.join("\n"), /missing entry point: CLAUDE.md/)));

test("checks active host agent definition links", () => fixture((files) => {
  files[".claude/agents/queue-reviewer.md"] = "[Review](../skills/missing/FINALIZATION.md)\n";
}, (errors) => assert.match(errors.join("\n"), /\.claude\/agents\/queue-reviewer.md: missing link target/)));
