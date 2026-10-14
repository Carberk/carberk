#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const valid = `# AutoTM Domain Glossary\n\nGoverned by [ADR-0042](../adr/0042-domain-glossary-authority-and-mutability.md).\n\n## Listings\n\n**Listing**\n\nA vehicle offer published for marketplace discovery.\n`;

function createFixture(glossary) {
  const root = mkdtempSync(join(tmpdir(), "auto-tm-glossary-"));
  mkdirSync(join(root, "docs", "domain"), { recursive: true });
  mkdirSync(join(root, "docs", "adr"), { recursive: true });
  mkdirSync(join(root, "docs", "agents"), { recursive: true });
  mkdirSync(join(root, ".claude", "skills", "shape-with-docs"), { recursive: true });
  mkdirSync(join(root, ".claude", "skills", "new-adr"), { recursive: true });
  mkdirSync(join(root, ".claude", "skills", "create-sprint-issues"), { recursive: true });
  mkdirSync(join(root, ".claude", "skills", "run-issue"), { recursive: true });
  mkdirSync(join(root, ".claude", "skills", "run-queue"), { recursive: true });
  mkdirSync(join(root, ".claude", "skills", "resume-issue"), { recursive: true });
  mkdirSync(join(root, ".claude", "skills", "design-grill"), { recursive: true });
  mkdirSync(join(root, ".claude", "skills", "wireframe"), { recursive: true });
  mkdirSync(join(root, ".claude", "skills", "hifi-design"), { recursive: true });
  mkdirSync(join(root, ".github", "workflows"), { recursive: true });
  writeFileSync(join(root, "docs", "domain", "GLOSSARY.md"), glossary);
  writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: {
    "check:glossary": "node scripts/check-domain-glossary.mjs",
    "test:glossary": "node --test scripts/check-domain-glossary.test.mjs",
    test: "pnpm test:agent-docs && pnpm test:glossary && turbo run test && pnpm test:reviewer-flow-smoke",
  } }));
  writeFileSync(join(root, "docs", "adr", "0042-domain-glossary-authority-and-mutability.md"), [
    "[`docs/domain/GLOSSARY.md`](../domain/GLOSSARY.md)",
    "[ADR-0019](0019-context-md-describes-current-state.md)",
    "[ADR-0020](0020-document-hierarchy-and-mutability.md)",
    "[ADR-0040](0040-repo-canonical-workflow-skills.md)",
  ].join("\n"));
  for (const name of ["0019-context-md-describes-current-state.md", "0020-document-hierarchy-and-mutability.md", "0040-repo-canonical-workflow-skills.md"]) {
    writeFileSync(join(root, "docs", "adr", name), "fixture\n");
  }
  writeFileSync(join(root, "docs", "adr", "0060-source-first-agent-context-and-task-scoped-guidance.md"), "fixture\n");
  writeFileSync(join(root, "docs", "adr", "README.md"), "[0042](0042-domain-glossary-authority-and-mutability.md)\n");
  writeFileSync(join(root, ".claude", "skills", "shape-with-docs", "SKILL.md"), [
    "[Glossary](../../../docs/domain/GLOSSARY.md)",
    "[ADR-0060](../../../docs/adr/0060-source-first-agent-context-and-task-scoped-guidance.md)",
    "[ADR-0020](../../../docs/adr/0020-document-hierarchy-and-mutability.md)",
    "[ADR-0042](../../../docs/adr/0042-domain-glossary-authority-and-mutability.md)",
    "[Workflow](../../../docs/agents/coding-workflow.md)",
    "[New ADR](../new-adr/SKILL.md)",
    "[Create sprint issues](../create-sprint-issues/SKILL.md)",
    "[Run issue](../run-issue/SKILL.md)",
  ].join("\n"));
  writeFileSync(join(root, ".claude", "skills", "new-adr", "SKILL.md"), "fixture\n");
  writeFileSync(join(root, ".claude", "skills", "run-queue", "SKILL.md"), "[Workflow](../../../docs/agents/coding-workflow.md)\n");
  for (const name of ["create-sprint-issues", "run-issue", "design-grill", "wireframe", "hifi-design"]) {
    writeFileSync(join(root, ".claude", "skills", name, "SKILL.md"), "[Glossary](../../../docs/domain/GLOSSARY.md)\n");
  }
  writeFileSync(join(root, ".claude", "skills", "resume-issue", "SKILL.md"), "[Glossary](../../../docs/domain/GLOSSARY.md)\n[Finalize](../run-issue/FINALIZATION.md)\n");
  writeFileSync(join(root, ".claude", "skills", "run-issue", "FINALIZATION.md"), "[Glossary](../../../docs/domain/GLOSSARY.md)\n");
  writeFileSync(join(root, "docs", "agents", "coding-workflow.md"), [
    "[Glossary](../domain/GLOSSARY.md)",
    "[Shape](../../.claude/skills/shape-with-docs/SKILL.md)",
    "[Specify and create tickets](../../.claude/skills/create-sprint-issues/SKILL.md)",
    "[Implement and review](../../.claude/skills/run-issue/SKILL.md)",
    "[Chief of Staff](../../.claude/skills/run-queue/SKILL.md)",
  ].join("\n"));
  writeFileSync(join(root, "docs", "agents", "domain.md"), "[Glossary](../domain/GLOSSARY.md)\n");
  writeFileSync(join(root, "docs", "agents", "issue-tracker.md"), "[Glossary](../domain/GLOSSARY.md)\n");
  writeFileSync(join(root, "AGENTS.md"), "[Glossary](docs/domain/GLOSSARY.md)\n[Workflow](docs/agents/coding-workflow.md)\n");
  writeFileSync(join(root, "CLAUDE.md"), "[Shared policy](AGENTS.md)\n");
  for (const name of ["ci.yml", "pr-checks.yml"]) writeFileSync(join(root, ".github", "workflows", name), "- run: pnpm check:glossary\n");
  return root;
}

function run(root) {
  const args = ["check:glossary", "--", "--root", root];
  return spawnSync("pnpm", args, { cwd: repoRoot, encoding: "utf8" });
}

function withFixture(glossary, assertion) {
  const root = createFixture(glossary);
  try { assertion(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

function failure(root) {
  const result = run(root);
  assert.notEqual(result.status, 0);
  return `${result.stdout}\n${result.stderr}`;
}

test("accepts one canonical term", () => withFixture(valid, (root) => {
  assert.match(execFileSync("pnpm", ["check:glossary", "--", "--root", root], { cwd: repoRoot, encoding: "utf8" }), /Domain glossary: ok/);
}));

test("rejects the removed glossary-only test interface", () => withFixture(valid, (root) => {
  const result = spawnSync("pnpm", ["check:glossary", "--", "--root", root, "--glossary-only"], { cwd: repoRoot, encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /unknown argument "--glossary-only"/);
}));

test("rejects duplicate canonical terms case-insensitively", () => withFixture(`${valid}\n## Cross-context\n\n**listing**\n\nA duplicate term.\n`, (root) => assert.match(failure(root), /duplicate canonical term "listing"/)));
test("rejects definitions longer than two sentences", () => withFixture(valid.replace("A vehicle offer published for marketplace discovery.", "One. Two. Three."), (root) => assert.match(failure(root), /must contain one or two sentences/)));
test("rejects definitions longer than 240 characters", () => withFixture(valid.replace("A vehicle offer published for marketplace discovery.", `${"A".repeat(240)}.`), (root) => assert.match(failure(root), /must be 240 characters or fewer/)));
test("rejects missing definitions", () => withFixture(valid.replace("A vehicle offer published for marketplace discovery.", "_Avoid_: Advert"), (root) => assert.match(failure(root), /needs a definition/)));
test("rejects unknown headings", () => withFixture(valid.replace("## Listings", "## Payments"), (root) => assert.match(failure(root), /unknown glossary heading "Payments"/)));
test("rejects forbidden sections", () => withFixture(valid.replace("## Listings", "## Implementation status"), (root) => assert.match(failure(root), /forbidden glossary section/)));
test("rejects malformed entries", () => withFixture(valid.replace("**Listing**", "**Listing** — inline"), (root) => assert.match(failure(root), /malformed term entry/)));
test("rejects synonym and canonical collisions", () => withFixture(`${valid}\n_Avoid_: Advert\n\n## Cross-context\n\n**Advert**\n\nA promoted placement.\n`, (root) => assert.match(failure(root), /avoided synonym "Advert" collides/)));
test("accepts complete repository integration", () => withFixture(valid, (root) => assert.equal(run(root).status, 0)));
test("accepts an equivalent root gate with reordered required checks", () => withFixture(valid, (root) => {
  const packagePath = join(root, "package.json");
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  packageJson.scripts.test = "pnpm test:glossary && pnpm test:agent-docs && turbo run test && pnpm test:reviewer-flow-smoke";
  writeFileSync(packagePath, JSON.stringify(packageJson));
  assert.equal(run(root).status, 0);
}));
for (const operator of [" || true", "; true", " | cat", " & true"]) {
  test(`rejects a root gate with ${operator.trim()}`, () => withFixture(valid, (root) => {
    const packagePath = join(root, "package.json");
    const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
    packageJson.scripts.test += operator;
    writeFileSync(packagePath, JSON.stringify(packageJson));
    assert.match(failure(root), /package.json root test gate must run agent-docs, glossary, and workspace tests/);
  }));
}
for (const step of ["pnpm test:agent-docs", "pnpm test:glossary", "turbo run test"]) {
  test(`rejects a root gate missing ${step}`, () => withFixture(valid, (root) => {
    const packagePath = join(root, "package.json");
    const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
    packageJson.scripts.test = packageJson.scripts.test.split(" && ").filter((part) => part !== step).join(" && ");
    writeFileSync(packagePath, JSON.stringify(packageJson));
    assert.match(failure(root), /package.json root test gate must run agent-docs, glossary, and workspace tests/);
  }));
}
test("rejects missing repository references", () => withFixture(valid, (root) => {
  writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: {} }));
  writeFileSync(join(root, "docs", "adr", "README.md"), "");
  writeFileSync(join(root, ".github", "workflows", "ci.yml"), "");
  const output = failure(root);
  assert.match(output, /package.json is missing the check:glossary script/);
  assert.match(output, /package.json root test gate must run agent-docs, glossary, and workspace tests/);
  assert.match(output, /docs\/adr\/README.md is missing the ADR-0042 link/);
  assert.match(output, /.github\/workflows\/ci.yml is missing pnpm check:glossary/);
}));
test("rejects a broken ADR index reference", () => withFixture(valid, (root) => {
  writeFileSync(join(root, "docs", "adr", "README.md"), "[0042-domain-glossary-authority-and-mutability.md](0042-wrong.md)\n");
  assert.match(failure(root), /docs\/adr\/README.md is missing the ADR-0042 link/);
}));
test("rejects a broken glossary governance link", () => withFixture(valid.replace("(../adr/0042-domain-glossary-authority-and-mutability.md)", "(../adr/0042-wrong.md)"), (root) => {
  assert.match(failure(root), /docs\/domain\/GLOSSARY.md is missing its ADR-0042 link/);
}));
test("rejects a broken governing ADR link", () => withFixture(valid, (root) => {
  const adrPath = join(root, "docs", "adr", "0042-domain-glossary-authority-and-mutability.md");
  writeFileSync(adrPath, [
    "[`docs/domain/GLOSSARY.md`](../domain/GLOSSARY.md)",
    "[0019-context-md-describes-current-state.md](0019-wrong.md)",
    "[ADR-0020](0020-document-hierarchy-and-mutability.md)",
    "[ADR-0040](0040-repo-canonical-workflow-skills.md)",
  ].join("\n"));
  assert.match(failure(root), /ADR-0042 has a broken ADR-0019 link/);
}));
test("rejects a missing shaping workflow", () => withFixture(valid, (root) => {
  rmSync(join(root, ".claude", "skills", "shape-with-docs", "SKILL.md"));
  assert.match(failure(root), /shape-with-docs is missing its glossary link/);
}));
test("rejects a broken workflow-router glossary link", () => withFixture(valid, (root) => {
  writeFileSync(join(root, "docs", "agents", "coding-workflow.md"), [
    "[Glossary](../domain/GLOSSARY-wrong.md)",
    "[Shape](../../.claude/skills/shape-with-docs/SKILL.md)",
    "[Specify and create tickets](../../.claude/skills/create-sprint-issues/SKILL.md)",
    "[Implement and review](../../.claude/skills/run-issue/SKILL.md)",
    "[Chief of Staff](../../.claude/skills/run-queue/SKILL.md)",
  ].join("\n"));
  assert.match(failure(root), /coding workflow is missing its glossary link/);
}));
for (const [label, target, diagnostic] of [
  ["ADR workflow", "../new-adr/SKILL.md", /shape-with-docs is missing its new-adr link/],
  ["sprint issue creation", "../create-sprint-issues/SKILL.md", /shape-with-docs is missing its create-sprint-issues link/],
  ["issue execution", "../run-issue/SKILL.md", /shape-with-docs is missing its run-issue link/],
]) {
  test(`rejects a broken shaping ${label} link`, () => withFixture(valid, (root) => {
    const skillPath = join(root, ".claude", "skills", "shape-with-docs", "SKILL.md");
    const skill = readFileSync(skillPath, "utf8").replace(`(${target})`, `(${target}.wrong)`);
    writeFileSync(skillPath, skill);
    assert.match(failure(root), diagnostic);
  }));
}
for (const [label, source, target, diagnostic] of [
  ["Chief of Staff workflow authority", ".claude/skills/run-queue/SKILL.md", "../../../docs/agents/coding-workflow.md", /Chief of Staff is missing its authoritative workflow link/],
  ["workflow orchestration", "docs/agents/coding-workflow.md", "../../.claude/skills/run-queue/SKILL.md", /coding workflow is missing its Chief of Staff link/],
  ["sprint issue creation", ".claude/skills/create-sprint-issues/SKILL.md", "../../../docs/domain/GLOSSARY.md", /create-sprint-issues is missing its glossary link/],
  ["child issue contract", "docs/agents/issue-tracker.md", "../domain/GLOSSARY.md", /issue tracker guidance is missing its glossary link/],
  ["issue execution", ".claude/skills/run-issue/SKILL.md", "../../../docs/domain/GLOSSARY.md", /run-issue is missing its glossary link/],
  ["issue resume", ".claude/skills/resume-issue/SKILL.md", "../../../docs/domain/GLOSSARY.md", /resume-issue is missing its glossary link/],
  ["design orchestration", ".claude/skills/design-grill/SKILL.md", "../../../docs/domain/GLOSSARY.md", /design-grill is missing its glossary link/],
  ["wireframe", ".claude/skills/wireframe/SKILL.md", "../../../docs/domain/GLOSSARY.md", /wireframe is missing its glossary link/],
  ["hi-fi design", ".claude/skills/hifi-design/SKILL.md", "../../../docs/domain/GLOSSARY.md", /hifi-design is missing its glossary link/],
  ["fixed-commit review", ".claude/skills/run-issue/FINALIZATION.md", "../../../docs/domain/GLOSSARY.md", /run-issue finalization is missing its glossary link/],
  ["resumed fixed-commit review", ".claude/skills/resume-issue/SKILL.md", "../run-issue/FINALIZATION.md", /resume-issue is missing its fixed-commit finalization link/],
]) {
  test(`rejects a broken downstream ${label} link`, () => withFixture(valid, (root) => {
    const path = join(root, source);
    const content = readFileSync(path, "utf8").replace(`(${target})`, `(${target}.wrong)`);
    writeFileSync(path, content);
    assert.match(failure(root), diagnostic);
  }));
}

test("rejects a broken Claude shared-policy route", () => withFixture(valid, (root) => {
  writeFileSync(join(root, "CLAUDE.md"), "[Shared policy](AGENTS-wrong.md)\n");
  assert.match(failure(root), /CLAUDE.md is missing its shared-policy link/);
}));
