import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
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
    mkdirSync(join(root, ".agents"));
    mkdirSync(join(root, ".claude/skills"), { recursive: true });
    symlinkSync("../.claude/skills", join(root, ".agents/skills"));
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

test("rejects deprecated skills that still load a description", () => fixture((files) => {
  files[".claude/skills/old/SKILL.md"] = "---\nname: old\ndescription: Deprecated route for a retired workflow.\n---\n";
  files[".claude/skills/folded/SKILL.md"] = "---\nname: folded\ndescription: >-\n  Deprecated route.\n---\n";
  files[".claude/skills/live/SKILL.md"] = "---\nname: live\ndescription: Use when replacing deprecated code.\n---\n";
}, (errors) => assert.deepEqual(errors, [
  ".claude/skills/old/SKILL.md: deprecated skill still loads its description; delete the skill",
  ".claude/skills/folded/SKILL.md: deprecated skill still loads its description; delete the skill",
])));

test("checks active host agent definition links", () => fixture((files) => {
  files[".claude/agents/reviewer.md"] = "[Review](../skills/missing/FINALIZATION.md)\n";
}, (errors) => assert.match(errors.join("\n"), /\.claude\/agents\/reviewer.md: missing link target/)));

function repository(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "carberk-doc-policy-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, text = "# Document\n") => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
  write("AGENTS.md");
  write("CLAUDE.md", "[Shared](AGENTS.md)\n@AGENTS.md\n");
  write("CONTEXT-MAP.md");
  write("docs/existing.md");
  write("docs/retired.md");
  write("docs/adr/0001-decision.md", "# Decision\nImmutable body.\n");
  write(".claude/skills/THIRD-PARTY-NOTICES.md", "Required attribution.\n");
  write("LICENSE", "Required license.\n");
  write(".gitignore", ".scratch/\nnode_modules/\napps/web/.next/\n");
  write("scripts/placeholder", "");
  mkdirSync(join(root, ".agents"));
  symlinkSync("../.claude/skills", join(root, ".agents/skills"));
  copyFileSync(new URL("./check-agent-docs.mjs", import.meta.url), join(root, "scripts/check-agent-docs.mjs"));
  git("init", "-q");
  git("add", ".");
  const commit = () => git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", "commit", "-qm", "fixture");
  commit();
  rmSync(join(root, "docs/retired.md"));
  git("add", "-u");
  commit();
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  const run = (env = {}) => spawnSync(process.execPath, [join(root, "scripts/check-agent-docs.mjs")], {
    cwd: root, encoding: "utf8", env: { ...process.env, GITHUB_ACTIONS: "", GITHUB_EVENT_PATH: "", ...env },
  });
  return { root, write, git, run, commit };
}

test("the local policy rejects untracked proof notes", t => {
  const { write, run } = repository(t);
  write("proof.md");
  const result = run();
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /unauthorized Markdown path: proof\.md/);
});

for (const [name, path, prepare] of [
  ["staged task notes", "task.md", ({ write, git }) => { write("task.md"); git("add", "task.md"); }],
  ["committed task notes", "task.md", ({ write, git, commit }) => { write("task.md"); git("add", "task.md"); commit(); }],
  ["staged notes removed from disk", "task.md", ({ root, write, git }) => { write("task.md"); git("add", "task.md"); rmSync(join(root, "task.md")); }],
  ["rename laundering", "docs/replacement.md", ({ git }) => git("mv", "docs/existing.md", "docs/replacement.md")],
  ["copied documents", "docs/copy.md", ({ root }) => copyFileSync(join(root, "docs/existing.md"), join(root, "docs/copy.md"))],
  ["case variants", "docs/EXISTING.MD", ({ git }) => git("mv", "docs/existing.md", "docs/EXISTING.MD")],
  ["ignored scratch notes", ".scratch/proof.md", ({ write }) => write(".scratch/proof.md")],
  ["retired paths", "docs/retired.md", ({ write }) => write("docs/retired.md")],
  ["self-authored allowances", "proof.md", ({ write }) => { write("proof.md"); write(".markdown-policy.json", '{"allowed":["proof.md"]}'); }],
  ["tracked dependency notes", "node_modules/proof.md", ({ write, git }) => { write("node_modules/proof.md"); git("add", "-f", "node_modules/proof.md"); }],
]) {
  test(`the policy rejects ${name} without deletion credit`, t => {
    const fixture = repository(t);
    prepare(fixture);
    const result = fixture.run();
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.ok(result.stderr.includes(`unauthorized Markdown path: ${path}`), result.stderr);
  });
}

for (const extension of ["mdx", "markdown", "mdown", "mkdn", "mkd", "mdwn", "mdtxt", "mdtext", "Rmd", "qmd"]) {
  test(`the policy rejects Markdown-like .${extension} notes`, t => {
    const { write, run } = repository(t);
    write(`proof.${extension}`);
    assert.equal(run().status, 1);
  });
}

test("existing document edits and retirement do not require new paths", t => {
  const { root, write, git, run } = repository(t);
  write("docs/existing.md", "# Updated guidance\n");
  git("add", "docs/existing.md");
  write("docs/existing.md", "# Further guidance\n");
  assert.equal(run().status, 0);
  rmSync(join(root, "docs/existing.md"));
  git("add", "-u");
  assert.equal(run().status, 0);
});

test("recognized dependencies and generated caches are pruned but scratch is scanned", t => {
  const { write, run } = repository(t);
  for (const path of ["node_modules/dependency/README.md", "apps/web/.next/generated.md", "apps/mobile/ios/Pods/README.md", "packages/db/generated/README.md", ".turbo/cache/notes.md"]) write(path);
  assert.equal(run().status, 0);
  write("apps/web/.scratch/proof.md");
  assert.equal(run().status, 1);
});

test("symlinked Markdown and directory aliases fail without reading external content", t => {
  const { root, run } = repository(t);
  const external = mkdtempSync(join(tmpdir(), "carberk-external-docs-"));
  t.after(() => rmSync(external, { recursive: true, force: true }));
  writeFileSync(join(external, "outside.md"), "External private text must never be printed.\n");
  symlinkSync(join(external, "outside.md"), join(root, "proof.md"));
  symlinkSync(external, join(root, "external"));
  symlinkSync(join(root, "docs/existing.md"), join(root, "alias.markdown"));
  const result = run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unauthorized Markdown path: proof.md/);
  assert.match(result.stderr, /unauthorized Markdown path: alias.markdown/);
  assert.match(result.stderr, /first-party symlink is not allowed: external/);
  assert.doesNotMatch(result.stderr + result.stdout, /External private text|external\/outside.md/);
});

for (const path of ["docs/adr/0001-decision.md", ".claude/skills/THIRD-PARTY-NOTICES.md", "LICENSE"]) {
  for (const state of ["edited", "deleted", "staged edit restored on disk", "symlinked"]) {
    test(`preserves ${path} when ${state}`, t => {
      const { root, write, git, run } = repository(t);
      const original = readFileSync(join(root, path));
      if (state === "deleted" || state === "symlinked") rmSync(join(root, path));
      else write(path, "Replaced protected text.\n");
      if (state === "symlinked") symlinkSync(join(root, "docs/existing.md"), join(root, path));
      if (state === "staged edit restored on disk") { git("add", path); write(path, original); }
      const result = run();
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.ok(result.stderr.includes(`immutable ADR or required notice changed or removed: ${path}`), result.stderr);
    });
  }
}

for (const state of ["missing", "directory", "wrong target"]) {
  test(`requires the canonical Codex skills link when ${state}`, t => {
    const { root, run } = repository(t);
    unlinkSync(join(root, ".agents/skills"));
    if (state === "directory") mkdirSync(join(root, ".agents/skills"));
    if (state === "wrong target") symlinkSync("../docs", join(root, ".agents/skills"));
    const result = run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /\.agents\/skills must symlink to/);
  });
}

test("CI uses the event base even when the candidate rewrites its local main ref", t => {
  const { root, write, git, commit, run } = repository(t);
  const base = git("rev-parse", "HEAD").trim();
  write("proof.md");
  git("add", "proof.md");
  commit();
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  write("event.json", JSON.stringify({ pull_request: { base: { sha: base } } }));
  const result = run({ GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "pull_request", GITHUB_EVENT_PATH: join(root, "event.json") });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unauthorized Markdown path: proof.md/);
  write("event.json", JSON.stringify({ before: base }));
  assert.equal(run({ GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "push", GITHUB_EVENT_PATH: join(root, "event.json") }).status, 1);
});

test("missing trusted policy history fails closed and reports visibility limits", t => {
  const { git, run } = repository(t);
  git("update-ref", "-d", "refs/remotes/origin/main");
  const result = run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Documentation policy failed/);
  assert.match(result.stdout, /CI sees its checkout, not uncommitted work on other machines or arbitrary external \/tmp files/);
});


test("staging a broken Codex link fails even when disk is restored", t => {
  const { root, git, run } = repository(t);
  unlinkSync(join(root, ".agents/skills"));
  symlinkSync("../docs", join(root, ".agents/skills"));
  git("add", ".agents/skills");
  unlinkSync(join(root, ".agents/skills"));
  symlinkSync("../.claude/skills", join(root, ".agents/skills"));
  const result = run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /must stage the canonical Codex skills symlink/);
});
