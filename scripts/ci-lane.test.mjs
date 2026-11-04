import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import * as ci from "./ci-lane.mjs";
const { chooseLane, laneFor } = ci;

test("Markdown anywhere and any file under docs/ take the docs lane", () => {
  assert.equal(laneFor(["docs/adr/0065-x.md", "AGENTS.md", ".claude/skills/sol-loop/SKILL.md"]), "docs");
  assert.equal(laneFor(["docs/design/mockup.html", "docs/design/logo.png"]), "docs");
});

test("any non-docs file takes the full lane", () => {
  assert.equal(laneFor(["docs/adr/0065-x.md", "apps/mobile/src/app.tsx"]), "full");
  assert.equal(laneFor([".github/workflows/pr-checks.yml"]), "full");
  assert.equal(laneFor(["package.json"]), "full");
  assert.equal(laneFor(["pnpm-lock.yaml"]), "full");
});

test("an empty change takes the full lane", () => {
  assert.equal(laneFor([]), "full");
});

function repo(t) {
  const cwd = mkdtempSync(join(tmpdir(), "ci-lane-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  git("init", "-q", "--initial-branch=pr");
  git("config", "user.email", "ci@example.test");
  git("config", "user.name", "CI");
  git("config", "commit.gpgsign", "false");
  const commit = (files) => {
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(cwd, path)), { recursive: true });
      writeFileSync(join(cwd, path), content);
    }
    git("add", "-A");
    git("commit", "-q", "-m", "change");
    return git("rev-parse", "HEAD");
  };
  return { cwd, git, commit };
}

test("reads the lane from the commits between base and HEAD", (t) => {
  const { cwd, commit } = repo(t);
  const base = commit({ "src/app.ts": "one", "docs/a.md": "one" });
  commit({ "docs/a.md": "two", "README.md": "new" });
  assert.equal(chooseLane(base, cwd).lane, "docs");
  commit({ "src/app.ts": "two" });
  assert.equal(chooseLane(base, cwd).lane, "full");
});

test("moving code into docs/ is a code change", (t) => {
  const { cwd, git, commit } = repo(t);
  const base = commit({ "src/app.ts": "export const x = 1;\n".repeat(20), "docs/a.md": "one" });
  git("mv", "src/app.ts", "docs/app.ts");
  git("commit", "-q", "-m", "move");
  assert.equal(chooseLane(base, cwd).lane, "full");
});

test("a missing, all-zero, or unknown base takes the full lane", (t) => {
  const { cwd, commit } = repo(t);
  commit({ "docs/a.md": "one" });
  assert.equal(chooseLane(undefined, cwd).lane, "full");
  assert.equal(chooseLane("0000000000000000000000000000000000000000", cwd).lane, "full");
  const unknown = chooseLane("1234567890abcdef1234567890abcdef12345678", cwd);
  assert.equal(unknown.lane, "full");
  assert.match(unknown.reason, /could not list changed files/);
});

test("the command writes the lane to GITHUB_OUTPUT for the workflow", (t) => {
  const { cwd, commit } = repo(t);
  const base = commit({ "src/app.ts": "one" });
  commit({ "docs/a.md": "two" });
  const output = join(cwd, "github-output");
  const script = resolve(dirname(fileURLToPath(import.meta.url)), "ci-lane.mjs");
  execFileSync(process.execPath, [script, base], { cwd, env: { ...process.env, GITHUB_OUTPUT: output } });
  assert.equal(readFileSync(output, "utf8"), "lane=docs\n");
});

// The workflow checks out a synthetic merge, not the PR branch itself.
function pullRequest(t) {
  const r = repo(t);
  const base = r.commit({ "src/app.ts": "base\n", "docs/a.md": "base\n" });
  r.git("branch", "main", base);
  const before = r.commit({ "src/app.ts": "PR code\n", "docs/a.md": "PR docs\n" });
  return {
    ...r, base, before,
    finish() {
      const head = r.git("rev-parse", "HEAD");
      const main = r.git("rev-parse", "main");
      const tree = r.git("merge-tree", "--write-tree", main, head);
      const merge = r.git("commit-tree", tree, "-p", main, "-p", head, "-m", "synthetic merge");
      r.git("reset", "--hard", merge);
      return {
        action: "synchronize", number: 753, before, after: head,
        repository: { full_name: "owner/repo" },
        pull_request: {
          number: 753,
          head: { sha: head, repo: { full_name: "owner/repo" } },
          base: { sha: main, ref: "main", repo: { full_name: "owner/repo" } },
        },
      };
    },
  };
}

function green(event, overrides = {}) {
  return {
    total_count: 1,
    check_runs: [{
      name: "pr", head_sha: event.before, status: "completed", conclusion: "success",
      app: { slug: "github-actions" }, pull_requests: [{ number: 753 }], ...overrides,
    }],
  };
}

async function select(r, event, readCheckRuns = async () => green(event), options = {}) {
  return ci.chooseLaneForEvent("HEAD^1", r.cwd, { eventName: "pull_request", event, readCheckRuns, ...options });
}

test("one or several docs commits after a green code head take docs and explain why", async (t) => {
  const r = pullRequest(t);
  r.commit({ "docs/a.md": "evidence\n" });
  r.commit({ "README.md": "execution\n" });
  const event = r.finish();
  const result = await select(r, event);
  assert.equal(result.lane, "docs");
  assert.match(result.reason, /green.*previous head|previous head.*success/i);
});

test("docs-only merges from main ignore incoming code and accept docs conflict resolutions", async (t) => {
  const r = pullRequest(t);
  r.git("switch", "main");
  r.commit({ "src/main.ts": "incoming code\n", "docs/a.md": "main docs\n" });
  r.git("switch", "-");
  assert.throws(() => r.git("merge", "--no-ff", "main", "-m", "merge main"));
  r.commit({ "docs/a.md": "hand resolved docs\n" });
  r.commit({ "README.md": "evidence after merge\n" });
  assert.equal((await select(r, r.finish())).lane, "docs");
});

test("a clean main merge needs no manual changes to take docs", async (t) => {
  const r = pullRequest(t);
  r.git("switch", "main");
  r.commit({ "src/main.ts": "incoming code\n" });
  r.git("switch", "-");
  r.git("merge", "--no-ff", "main", "-m", "merge main");
  assert.equal((await select(r, r.finish())).lane, "docs");
});

test("hand edits to code in ordinary commits, even reverted later, take full", async (t) => {
  const r = pullRequest(t);
  r.commit({ "src/app.ts": "changed\n" });
  r.commit({ "src/app.ts": "PR code\n", "docs/a.md": "evidence\n" });
  assert.equal((await select(r, r.finish())).lane, "full");
});

test("extra hand edits to code in a clean main merge take full", async (t) => {
  const r = pullRequest(t);
  r.git("switch", "main");
  r.commit({ "src/main.ts": "incoming\n" });
  r.git("switch", "-");
  r.git("merge", "--no-ff", "--no-commit", "main");
  r.commit({ "src/app.ts": "hand edit\n", "docs/a.md": "evidence\n" });
  assert.equal((await select(r, r.finish())).lane, "full");
});

test("a non-docs binary conflict takes full even when the automatic tree keeps ours", async (t) => {
  const r = pullRequest(t);
  r.commit({ "src/blob": "PR\0binary" });
  r.before = r.git("rev-parse", "HEAD");
  r.git("switch", "main");
  r.commit({ "src/blob": "main\0binary" });
  r.git("switch", "-");
  assert.throws(() => r.git("merge", "--no-ff", "main"));
  r.git("checkout", "--ours", "src/blob");
  r.commit({ "docs/a.md": "resolved\n" });
  const event = r.finish();
  event.before = r.before;
  assert.equal((await select(r, event)).lane, "full");
});

test("unreadable, missing, failed, cancelled, pending or ambiguous checks take full", async (t) => {
  const r = pullRequest(t);
  r.commit({ "docs/a.md": "evidence\n" });
  const event = r.finish();
  const responses = [
    undefined, {}, { total_count: 0, check_runs: [] },
    ...["failure", "cancelled", "skipped", "neutral", null].map(conclusion => green(event, { conclusion })),
    green(event, { status: "in_progress" }), green(event, { status: "queued" }),
    green(event, { name: "other" }), green(event, { head_sha: r.base }),
    green(event, { app: { slug: "other" } }), green(event, { pull_requests: [{ number: 99 }] }),
    { ...green(event), total_count: 2 },
    { total_count: 2, check_runs: [...green(event).check_runs, ...green(event).check_runs] },
  ];
  for (const response of responses) {
    assert.equal((await select(r, event, async () => response)).lane, "full", JSON.stringify(response));
  }
  assert.equal((await select(r, event, async () => { throw new Error("API unavailable"); })).lane, "full");
});

test("force pushes take the full lane", async (t) => {
  const r = pullRequest(t);
  r.git("reset", "--hard", r.base);
  r.commit({ "src/app.ts": "rewritten code\n", "docs/a.md": "docs\n" });
  const rewritten = r.finish();
  assert.equal((await select(r, rewritten)).lane, "full");
});

test("merges from outside main and octopus merges take full", async (t) => {
  const r = pullRequest(t);
  r.git("switch", "-c", "other", r.base);
  r.commit({ "docs/other.md": "other branch\n" });
  r.git("switch", "--detach", r.before);
  r.git("merge", "--no-ff", "other", "-m", "other branch merge");
  assert.equal((await select(r, r.finish())).lane, "full");
  r.git("switch", "--detach", r.before);
  const octopus = r.git("commit-tree", "HEAD^{tree}", "-p", r.before, "-p", r.base, "-p", "other", "-m", "octopus");
  r.git("reset", "--hard", octopus);
  assert.equal((await select(r, r.finish())).lane, "full");
});

test("the original whole-PR docs rule still works without event or API input", async (t) => {
  const r = pullRequest(t);
  r.git("reset", "--hard", r.base);
  r.commit({ "docs/a.md": "docs\n" });
  const event = r.finish();
  assert.equal((await select(r, { ...event, action: "opened" }, async () => { throw new Error("must not need API"); })).lane, "docs");
});

function shallowCheckout(t, r) {
  r.git("branch", "checkout", "HEAD");
  const cwd = mkdtempSync(join(tmpdir(), "ci-lane-shallow-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  execFileSync("git", ["clone", "-q", "--depth=2", "--branch=checkout", `file://${r.cwd}`, cwd]);
  return { ...r, cwd };
}

test("depth-2 synthetic checkout deepens exact history to prove docs commits", async (t) => {
  const r = pullRequest(t);
  r.commit({ "docs/a.md": "docs one\n" });
  r.commit({ "README.md": "docs two\n" });
  const event = r.finish();
  const shallow = shallowCheckout(t, r);
  assert.equal((await select(shallow, event)).lane, "full");
  assert.equal((await select(shallow, event, async () => green(event), { fetchHistory: true })).lane, "docs");
  assert.equal(execFileSync("git", ["rev-parse", "HEAD"], { cwd: shallow.cwd, encoding: "utf8" }).trim(), r.git("rev-parse", "HEAD"));
});

test("shallow merges deepen to their common base and docs resolutions take docs", async (t) => {
  const r = pullRequest(t);
  r.git("switch", "main");
  for (let i = 0; i < 5; i++) r.commit({ "src/main.ts": `incoming ${i}\n` });
  r.commit({ "docs/a.md": "main docs\n" });
  r.git("switch", "-");
  assert.throws(() => r.git("merge", "--no-ff", "main", "-m", "merge main"));
  r.commit({ "docs/a.md": "resolved docs\n" });
  const event = r.finish();
  const shallow = shallowCheckout(t, r);
  assert.equal((await select(shallow, event)).lane, "full");
  const result = await select(shallow, event, async () => green(event), { fetchHistory: true });
  assert.equal(result.lane, "docs", result.reason);
});

test("a failed history fetch stays full", async (t) => {
  const r = pullRequest(t);
  r.commit({ "docs/a.md": "docs\n" });
  const event = r.finish();
  const shallow = shallowCheckout(t, r);
  execFileSync("git", ["remote", "set-url", "origin", join(shallow.cwd, "missing-repo")], { cwd: shallow.cwd });
  assert.equal((await select(shallow, event, async () => green(event), { fetchHistory: true })).lane, "full");
});

test("missing or mismatched event and checkout evidence cannot take the new docs path", async (t) => {
  const r = pullRequest(t);
  r.commit({ "docs/a.md": "docs\n" });
  const event = r.finish();
  for (const change of [
    { before: undefined }, { before: "0".repeat(40) }, { before: "--help" },
    { after: r.base }, { action: "opened" }, { action: "reopened" },
    { repository: { full_name: "different/repo" } }, { number: 99 },
    { pull_request: { ...event.pull_request, base: { ...event.pull_request.base, ref: "release" } } },
    { pull_request: { ...event.pull_request, base: { ...event.pull_request.base, sha: r.before } } },
    { pull_request: { ...event.pull_request, head: { ...event.pull_request.head, sha: r.before } } },
  ]) {
    assert.equal((await select(r, { ...event, ...change })).lane, "full", JSON.stringify(change));
  }
  assert.equal((await select(r, undefined)).lane, "full");
  assert.equal((await select(r, event, async () => green(event), { eventName: "push" })).lane, "full");
  r.git("reset", "--hard", event.after);
  r.commit({ "src/app.ts": "different checkout code\n" });
  assert.equal((await select(r, event)).lane, "full");
});

test("hand resolving a text code conflict or moving code into docs takes full", async (t) => {
  const r = pullRequest(t);
  r.git("switch", "main");
  r.commit({ "src/app.ts": "main code\n" });
  r.git("switch", "-");
  assert.throws(() => r.git("merge", "--no-ff", "main", "-m", "merge main"));
  r.commit({ "src/app.ts": "resolved code\n", "docs/a.md": "evidence\n" });
  assert.equal((await select(r, r.finish())).lane, "full");
  r.git("reset", "--hard", r.before);
  r.git("branch", "-f", "main", r.base);
  r.git("mv", "src/app.ts", "docs/app.ts");
  r.git("commit", "-q", "-m", "move code into docs");
  assert.equal((await select(r, r.finish())).lane, "full");
});

test("leading whitespace paths do not disguise hand code edits as docs", async (t) => {
  const r = pullRequest(t);
  r.commit({ " docs/hidden-code": "code\n", "docs/a.md": "evidence\n" });
  assert.equal((await select(r, r.finish())).lane, "full");
});

test("a stale event base SHA still uses the synthetic merge's current main parent", async (t) => {
  const r = pullRequest(t);
  r.git("switch", "main");
  r.commit({ "src/main.ts": "new main code\n" });
  r.git("switch", "-");
  r.commit({ "docs/a.md": "docs evidence\n" });
  const event = r.finish();
  // Observed on GitHub: PR base.sha still named the old base while the
  // synchronize checkout's HEAD^1 named the updated main commit.
  event.pull_request.base.sha = r.base;
  const result = await select(r, event);
  assert.equal(result.lane, "docs", result.reason);
  const shallow = shallowCheckout(t, r);
  const fetched = await select(shallow, event, async () => green(event), { fetchHistory: true });
  assert.equal(fetched.lane, "docs", fetched.reason);
});

test("a fork head takes full on an otherwise docs-eligible synchronize event", async (t) => {
  const r = pullRequest(t);
  r.commit({ "docs/a.md": "docs evidence\n" });
  const event = r.finish();
  assert.equal((await select(r, event)).lane, "docs");
  const forkEvent = {
    ...event,
    pull_request: {
      ...event.pull_request,
      head: {
        ...event.pull_request.head,
        repo: { ...event.pull_request.head.repo, full_name: "fork-owner/repo" },
      },
    },
  };
  assert.equal((await select(r, forkEvent)).lane, "full");
});

test("ordinary full runs list readable changed files without a warning", (t) => {
  const { cwd, commit } = repo(t);
  const base = commit({ "src/app.ts": "one\n" });
  commit({ "src/app.ts": "two\n" });
  const script = resolve(dirname(fileURLToPath(import.meta.url)), "ci-lane.mjs");
  const output = execFileSync(process.execPath, [script, base], {
    cwd, encoding: "utf8",
    env: { ...process.env, GITHUB_EVENT_NAME: "push", GITHUB_EVENT_PATH: "" },
  });
  assert.match(output, /Changed files:\nsrc\/app\.ts/);
  assert.doesNotMatch(output, /::warning::/);
  assert.match(output, /CI lane: full/);
});

test("an unreadable diff still warns and takes full", (t) => {
  const { cwd, commit } = repo(t);
  commit({ "docs/a.md": "docs\n" });
  const script = resolve(dirname(fileURLToPath(import.meta.url)), "ci-lane.mjs");
  const output = execFileSync(process.execPath, [script, "f".repeat(40)], {
    cwd, encoding: "utf8",
    env: { ...process.env, GITHUB_EVENT_NAME: "push", GITHUB_EVENT_PATH: "" },
  });
  assert.match(output, /::warning::could not list changed files/);
  assert.match(output, /CI lane: full/);
});
