import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  classifyWorktree,
  findStaleBranches,
  findStaleRailwayEnvironments,
  formatReport,
  loadPrs,
  main,
  parseClaudeSessions,
  scanClaudeSessions,
  parseWorktreePorcelain,
  planApply,
  realpathOrSelf,
  runApply,
} from "./worktree-gc.mjs";

const HOME = "/Users/dev";
const MAIN = "/Users/dev/Projects/auto.tm-rewrite";
const SHA = (n) => String(n).padStart(40, "a");

const PORCELAIN = [
  `worktree ${MAIN}`,
  `HEAD ${SHA(1)}`,
  "branch refs/heads/main",
  "",
  `worktree ${MAIN}/.claude/worktrees/agent-abc`,
  `HEAD ${SHA(2)}`,
  "branch refs/heads/worktree-agent-abc",
  "locked claude session issue-9 (pid 42 start Thu Oct 1 11:00:00 2026)",
  "",
  `worktree ${HOME}/.codex/queue-worktrees/q-1`,
  `HEAD ${SHA(3)}`,
  "detached",
  "",
  `worktree ${HOME}/.codex/worktrees/1b73/auto.tm-rewrite`,
  `HEAD ${SHA(4)}`,
  "detached",
  "locked",
  "",
  `worktree ${MAIN}/.claude/worktrees/gone`,
  `HEAD ${SHA(5)}`,
  "branch refs/heads/agent/issue-5",
  "prunable gitdir file points to non-existent location",
  "",
  `worktree ${MAIN}/.claude/worktrees/unborn`,
  `HEAD ${"0".repeat(40)}`,
  "branch refs/heads/agent/issue-6",
  "",
].join("\n");

test("parses git worktree list --porcelain into entries", () => {
  const entries = parseWorktreePorcelain(PORCELAIN);
  assert.equal(entries.length, 6);
  assert.deepEqual(entries[0], {
    path: MAIN,
    head: SHA(1),
    branch: "main",
    detached: false,
    bare: false,
    locked: false,
    lockReason: null,
    prunable: false,
  });
  assert.equal(entries[1].branch, "worktree-agent-abc");
  assert.equal(entries[1].locked, true);
  assert.equal(entries[1].lockReason, "claude session issue-9 (pid 42 start Thu Oct 1 11:00:00 2026)");
  assert.equal(entries[2].detached, true);
  assert.equal(entries[2].branch, null);
  assert.equal(entries[3].locked, true);
  assert.equal(entries[3].lockReason, "");
  assert.equal(entries[4].prunable, true);
  assert.equal(entries[5].head, "0".repeat(40));
});

const entry = (overrides = {}) => ({
  path: `${MAIN}/.claude/worktrees/issue-1`,
  head: SHA(10),
  branch: "agent/issue-1",
  detached: false,
  bare: false,
  locked: false,
  lockReason: null,
  prunable: false,
  ...overrides,
});

const pr = (overrides = {}) => ({
  number: 12,
  state: "MERGED",
  headRefName: "agent/issue-1",
  headRefOid: SHA(10),
  baseRefName: "main",
  url: "https://github.com/o/r/pull/12",
  ...overrides,
});

const context = (overrides = {}) => ({
  mainPath: MAIN,
  currentPath: `${MAIN}/.claude/worktrees/self`,
  dirtyCount: 0,
  activeProcesses: [],
  onMain: false,
  prs: [pr()],
  isAncestor: () => false,
  ...overrides,
});

test("a clean worktree at the head of a merged PR is removed", () => {
  const verdict = classifyWorktree(entry(), context());
  assert.equal(verdict.verdict, "remove");
  assert.equal(verdict.pr.number, 12);
  assert.match(verdict.reason, /PR #12 merged/);
});

test("a clean HEAD that is an ancestor of the merged PR head is removed", () => {
  const verdict = classifyWorktree(
    entry({ branch: null, detached: true, head: SHA(11) }),
    context({ isAncestor: (a, b) => a === SHA(11) && b === SHA(10) }),
  );
  assert.equal(verdict.verdict, "remove");
  assert.match(verdict.reason, /ancestor of PR #12/);
});

test("the main checkout is kept", () => {
  const verdict = classifyWorktree(entry({ path: MAIN, branch: "main" }), context());
  assert.deepEqual([verdict.verdict, verdict.reason], ["keep", "the main checkout"]);
});

test("a Codex app-managed worktree is kept", () => {
  const verdict = classifyWorktree(
    entry({ path: `${HOME}/.codex/worktrees/1b73/auto.tm-rewrite`, branch: null, detached: true }),
    context(),
  );
  assert.equal(verdict.verdict, "keep");
  assert.match(verdict.reason, /Codex app-managed worktree/);
});

test("a Codex queue worktree outside ~/.codex/worktrees is not treated as app-managed", () => {
  const verdict = classifyWorktree(
    entry({ path: `${HOME}/.codex/queue-worktrees/q-1` }),
    context(),
  );
  assert.equal(verdict.verdict, "remove");
});

test("the worktree running this script is kept", () => {
  const verdict = classifyWorktree(entry({ path: `${MAIN}/.claude/worktrees/self` }), context());
  assert.equal(verdict.verdict, "keep");
  assert.match(verdict.reason, /current session/);
});

test("a locked worktree is kept with its lock reason", () => {
  const verdict = classifyWorktree(entry({ locked: true, lockReason: "manual hold" }), context());
  assert.equal(verdict.verdict, "keep");
  assert.match(verdict.reason, /^locked: manual hold/);
});

test("a lock without a reason is still a lock", () => {
  const verdict = classifyWorktree(entry({ locked: true, lockReason: "" }), context());
  assert.equal(verdict.verdict, "keep");
  assert.match(verdict.reason, /^locked/);
});

test("a worktree locked by another Claude session is kept as that session's", () => {
  const verdict = classifyWorktree(
    entry({ locked: true, lockReason: "claude session issue-9 (pid 42 start Thu Oct 1 11:00:00 2026)" }),
    context(),
  );
  assert.equal(verdict.verdict, "keep");
  assert.match(verdict.reason, /another session's worktree/);
});

test("a worktree with a running process inside it is kept as a running agent", () => {
  const verdict = classifyWorktree(
    entry(),
    context({
      activeProcesses: [{ pid: 77, command: "claude", cwd: `${MAIN}/.claude/worktrees/issue-1/apps/mobile` }],
    }),
  );
  assert.equal(verdict.verdict, "keep");
  assert.match(verdict.reason, /running agent: pid 77 \(claude\)/);
});

test("a process in a sibling directory with the same prefix does not count", () => {
  const verdict = classifyWorktree(
    entry(),
    context({ activeProcesses: [{ pid: 77, command: "node", cwd: `${MAIN}/.claude/worktrees/issue-10` }] }),
  );
  assert.equal(verdict.verdict, "remove");
});

test("a dirty tree is kept with its entry count", () => {
  const verdict = classifyWorktree(entry(), context({ dirtyCount: 3 }));
  assert.deepEqual([verdict.verdict, verdict.reason], ["keep", "dirty tree (3 changed paths)"]);
});

test("an unreadable status is kept, never treated as clean", () => {
  const verdict = classifyWorktree(entry(), context({ dirtyCount: null }));
  assert.equal(verdict.verdict, "keep");
  assert.match(verdict.reason, /status could not be read/);
});

test("an open PR keeps the worktree", () => {
  const verdict = classifyWorktree(entry(), context({ prs: [pr({ state: "OPEN" })] }));
  assert.deepEqual([verdict.verdict, verdict.reason], ["keep", "PR #12 is open"]);
});

test("a closed unmerged PR keeps the worktree", () => {
  const verdict = classifyWorktree(entry(), context({ prs: [pr({ state: "CLOSED" })] }));
  assert.deepEqual([verdict.verdict, verdict.reason], ["keep", "PR #12 closed without merging"]);
});

test("an open PR wins over a merged PR that also matches", () => {
  const verdict = classifyWorktree(
    entry(),
    context({ prs: [pr({ number: 3, state: "MERGED" }), pr({ number: 4, state: "OPEN" })] }),
  );
  assert.equal(verdict.verdict, "keep");
  assert.match(verdict.reason, /PR #4 is open/);
});

test("this branch's own open PR keeps the worktree even when another branch's merged PR contains HEAD", () => {
  const verdict = classifyWorktree(
    entry({ head: SHA(11) }),
    context({
      prs: [
        pr({ number: 5, state: "OPEN", headRefName: "agent/issue-1", headRefOid: SHA(12) }),
        pr({ number: 6, state: "MERGED", headRefName: "agent/issue-0", headRefOid: SHA(10) }),
      ],
      isAncestor: (a, b) => a === SHA(11) && b === SHA(10),
    }),
  );
  assert.deepEqual([verdict.verdict, verdict.reason], ["keep", "PR #5 is open"]);
});

test("a live Claude session working in the worktree keeps it as a running agent", () => {
  const sessions = parseClaudeSessions(
    JSON.stringify([
      { pid: 41, cwd: `${MAIN}/.claude/worktrees/issue-1/apps/api`, kind: "background", name: "AutoTM issue-1", status: "busy" },
      { pid: 42, cwd: MAIN, kind: "interactive", name: "orchestrator", status: "idle" },
    ]),
  );
  assert.equal(sessions.sessions.length, 2);
  const verdict = classifyWorktree(entry(), context({ activeProcesses: sessions.sessions }));
  assert.equal(verdict.verdict, "keep");
  assert.match(verdict.reason, /running agent: pid 41 \(claude session "AutoTM issue-1"\)/);
});

test("a Claude session in a sibling directory with the same prefix does not count", () => {
  const sessions = parseClaudeSessions(
    JSON.stringify([{ pid: 41, cwd: `${MAIN}/.claude/worktrees/issue-10`, kind: "background", name: "other" }]),
  );
  assert.equal(classifyWorktree(entry(), context({ activeProcesses: sessions.sessions })).verdict, "remove");
});

test("Claude session data that cannot be read is unknown, never an empty list", () => {
  assert.equal(parseClaudeSessions("not json"), null);
  assert.equal(parseClaudeSessions(JSON.stringify({ sessions: [] })), null);
  assert.equal(parseClaudeSessions(JSON.stringify(["not an object"])), null);
  assert.equal(parseClaudeSessions(JSON.stringify([null])), null);
  assert.deepEqual(parseClaudeSessions("[]"), { sessions: [], withoutCwd: 0 });
});

test("no PR match keeps the worktree", () => {
  const verdict = classifyWorktree(entry(), context({ prs: [] }));
  assert.equal(verdict.verdict, "keep");
  assert.match(verdict.reason, /^no PR match/);
});

test("commits after the PR head are not matched, so they are never lost", () => {
  const verdict = classifyWorktree(
    entry({ head: SHA(99) }),
    context({ isAncestor: () => false }),
  );
  assert.equal(verdict.verdict, "keep");
  assert.match(verdict.reason, /^no PR match/);
});

test("an ancestor check that cannot be answered is no match", () => {
  const verdict = classifyWorktree(
    entry({ head: SHA(99), branch: null, detached: true }),
    context({ isAncestor: () => null }),
  );
  assert.equal(verdict.verdict, "keep");
  assert.match(verdict.reason, /^no PR match/);
});

test("a detached HEAD already on main is not matched to a PR by ancestry", () => {
  const verdict = classifyWorktree(
    entry({ head: SHA(11), branch: null, detached: true }),
    context({ onMain: true, isAncestor: () => true }),
  );
  assert.equal(verdict.verdict, "keep");
  assert.match(verdict.reason, /^no PR match/);
});

test("an unborn branch is kept", () => {
  const verdict = classifyWorktree(entry({ head: "0".repeat(40) }), context());
  assert.deepEqual([verdict.verdict, verdict.reason], ["keep", "unborn branch"]);
});

test("evidence, prototype and research branches are kept even when their PR merged", () => {
  for (const branch of ["evidence/mobile-results", "agent/prototype-search", "research/ci", "x/issue-9-evidence"]) {
    const verdict = classifyWorktree(entry({ branch }), context({ prs: [pr({ headRefName: branch })] }));
    assert.equal(verdict.verdict, "keep", branch);
    assert.match(verdict.reason, /evidence, prototype or research/, branch);
  }
});

test("a directory named for evidence keeps a detached worktree", () => {
  const verdict = classifyWorktree(
    entry({ path: `${MAIN}/.claude/worktrees/prototype-filters`, branch: null, detached: true }),
    context(),
  );
  assert.equal(verdict.verdict, "keep");
  assert.match(verdict.reason, /evidence, prototype or research/);
});

test("a directory named for evidence keeps the worktree whether it is the listed path or the real path", () => {
  const detached = { branch: null, detached: true };
  const viaLink = entry({ ...detached, path: `${MAIN}/.claude/worktrees/issue-1`, listedPath: `${MAIN}/.claude/worktrees/prototype-link` });
  const viaTarget = entry({ ...detached, path: `${MAIN}/.claude/worktrees/research-target`, listedPath: `${MAIN}/.claude/worktrees/plain-link` });
  for (const candidate of [viaLink, viaTarget]) {
    const verdict = classifyWorktree(candidate, context());
    assert.equal(verdict.verdict, "keep", candidate.listedPath);
    assert.match(verdict.reason, /evidence, prototype or research/, candidate.listedPath);
  }
  const plain = entry({ ...detached, listedPath: `${MAIN}/.claude/worktrees/plain-link` });
  assert.equal(classifyWorktree(plain, context()).verdict, "remove");
});

test("a branch like research-free names is not caught by substring accident", () => {
  const verdict = classifyWorktree(entry({ branch: "agent/issue-1-evidenceless" }), context());
  assert.equal(verdict.verdict, "remove");
});

test("a prunable entry with a missing directory is kept for git worktree prune", () => {
  const verdict = classifyWorktree(entry({ prunable: true }), context());
  assert.equal(verdict.verdict, "keep");
  assert.match(verdict.reason, /directory is missing/);
});

test("the first matching keep reason wins, so a locked dirty worktree reports its lock", () => {
  const verdict = classifyWorktree(entry({ locked: true, lockReason: "hold" }), context({ dirtyCount: 5 }));
  assert.match(verdict.reason, /^locked/);
});

test("stale branches are task and scaffold branches with no worktree whose tip is in a merged PR head", () => {
  const worktrees = [entry({ branch: "agent/issue-1" })];
  const branches = [
    { name: "agent/issue-1", sha: SHA(10) },
    { name: "agent/issue-2", sha: SHA(20) },
    { name: "agent/issue-3", sha: SHA(30) },
    { name: "worktree-agent-abc", sha: SHA(40) },
    { name: "worktree-agent-def", sha: SHA(50) },
    { name: "main", sha: SHA(60) },
    { name: "claude/other", sha: SHA(70) },
  ];
  const prs = [
    pr({ number: 20, headRefName: "agent/issue-2", headRefOid: SHA(20), state: "MERGED" }),
    pr({ number: 30, headRefName: "agent/issue-3", headRefOid: SHA(31), state: "OPEN" }),
    pr({ number: 40, headRefName: "x", headRefOid: SHA(41), state: "MERGED" }),
    pr({ number: 70, headRefName: "claude/other", headRefOid: SHA(70), state: "MERGED" }),
  ];
  const stale = findStaleBranches({
    branches,
    worktrees,
    prs,
    isAncestor: (a, b) => (a === SHA(40) && b === SHA(41)) || (a === SHA(30) && b === SHA(31)),
  });
  assert.deepEqual(
    stale.map((item) => [item.name, item.sha, item.pr.number]),
    [
      ["agent/issue-2", SHA(20), 20],
      ["worktree-agent-abc", SHA(40), 40],
    ],
  );
});

test("stale Railway environments are PR environments whose PR is closed", () => {
  const environments = [
    { id: "1", name: "staging", isEphemeral: false },
    { id: "2", name: "production", isEphemeral: false },
    { id: "3", name: "auto.tm-rewrite-pr-12", isEphemeral: true, meta: { prNumber: 12 } },
    { id: "4", name: "auto.tm-rewrite-pr-13", isEphemeral: true, meta: { prNumber: 13 } },
    { id: "5", name: "auto.tm-rewrite-pr-14", isEphemeral: true, meta: { prNumber: 14 } },
    { id: "6", name: "auto.tm-rewrite-pr-15", isEphemeral: true },
  ];
  const prs = [
    pr({ number: 12, state: "MERGED" }),
    pr({ number: 13, state: "OPEN" }),
    pr({ number: 15, state: "CLOSED" }),
  ];
  const result = findStaleRailwayEnvironments({ environments, prs });
  assert.deepEqual(
    result.closed.map((item) => [item.name, item.prNumber, item.prState]),
    [
      ["auto.tm-rewrite-pr-12", 12, "MERGED"],
      ["auto.tm-rewrite-pr-15", 15, "CLOSED"],
    ],
  );
  assert.deepEqual(result.unknown.map((item) => item.name), ["auto.tm-rewrite-pr-14"]);
});

const row = (overrides) => ({
  entry: entry(),
  verdict: { verdict: "remove", reason: "PR #12 merged", pr: pr() },
  ...overrides,
});

test("the apply plan removes only remove rows, without force", () => {
  const rows = [
    row(),
    row({
      entry: entry({ path: "/w/dirty", branch: "agent/issue-2", head: SHA(20) }),
      verdict: { verdict: "keep", reason: "dirty tree (1 changed paths)", pr: null },
    }),
  ];
  const steps = planApply({ rows, staleBranches: [] });
  const removes = steps.filter((step) => step.argv.slice(0, 3).join(" ") === "git worktree remove");
  assert.deepEqual(removes.map((step) => step.argv[3]), [entry().path]);
  for (const step of steps) {
    assert.ok(!step.argv.includes("--force"), step.argv.join(" "));
    assert.ok(!step.argv.includes("-f"), step.argv.join(" "));
    assert.ok(!step.argv.includes("-D"), step.argv.join(" "));
  }
  assert.deepEqual(steps.at(-1).argv, ["git", "worktree", "prune"]);
});

test("the apply plan deletes refs only conditionally on the expected sha", () => {
  const rows = [
    row(),
    row({
      entry: entry({ path: "/w/scaffold", branch: "worktree-agent-abc", head: SHA(40) }),
      verdict: { verdict: "remove", reason: "PR #40 merged", pr: pr({ number: 40, headRefOid: SHA(40) }) },
    }),
    row({
      entry: entry({ path: "/w/other", branch: "claude/handoff", head: SHA(50) }),
      verdict: { verdict: "remove", reason: "PR #50 merged", pr: pr({ number: 50, headRefOid: SHA(50) }) },
    }),
    row({
      entry: entry({ path: "/w/detached", branch: null, detached: true, head: SHA(60) }),
      verdict: { verdict: "remove", reason: "PR #60 merged", pr: pr({ number: 60, headRefOid: SHA(60) }) },
    }),
  ];
  const staleBranches = [{ name: "agent/issue-9", sha: SHA(90), pr: pr({ number: 9 }) }];
  const steps = planApply({ rows, staleBranches });
  const deletes = steps.filter((step) => step.argv[1] === "update-ref");
  assert.deepEqual(
    deletes.map((step) => step.argv),
    [
      ["git", "update-ref", "-d", "refs/heads/agent/issue-1", SHA(10)],
      ["git", "update-ref", "-d", "refs/heads/worktree-agent-abc", SHA(40)],
      ["git", "update-ref", "-d", "refs/heads/agent/issue-9", SHA(90)],
    ],
  );
  const lastRemove = Math.max(...steps.map((step, i) => (step.argv[1] === "worktree" && step.argv[2] === "remove" ? i : -1)));
  const firstDelete = steps.findIndex((step) => step.argv[1] === "update-ref");
  assert.ok(lastRemove < firstDelete, "worktrees are removed before refs are deleted");
});

test("the apply plan never removes a kept worktree even if handed one with a stale pr", () => {
  const steps = planApply({
    rows: [row({ verdict: { verdict: "keep", reason: "PR #12 is open", pr: pr({ state: "OPEN" }) } })],
    staleBranches: [],
  });
  assert.deepEqual(steps.map((step) => step.argv.join(" ")), ["git worktree prune"]);
});

test("applying stops at the first failure and reports what was done", () => {
  const steps = [
    { label: "one", argv: ["git", "a"] },
    { label: "two", argv: ["git", "b"] },
    { label: "three", argv: ["git", "c"] },
  ];
  const seen = [];
  const result = runApply(steps, (argv) => {
    seen.push(argv.join(" "));
    if (argv[1] === "b") throw new Error("fatal: contains modified or untracked files");
  });
  assert.deepEqual(seen, ["git a", "git b"]);
  assert.deepEqual(result.done.map((step) => step.label), ["one"]);
  assert.equal(result.failed.step.label, "two");
  assert.match(result.failed.error, /modified or untracked files/);
  assert.deepEqual(result.skipped.map((step) => step.label), ["three"]);
});

test("the report names the verdict and exact keep reason for every worktree", () => {
  const text = formatReport({
    rows: [
      {
        entry: entry({ path: "/w/a" }),
        size: "1.5 GB",
        dirtyCount: 0,
        verdict: { verdict: "remove", reason: "PR #12 merged", pr: pr() },
      },
      {
        entry: entry({ path: "/w/b", branch: null, detached: true }),
        size: "20 MB",
        dirtyCount: 2,
        verdict: { verdict: "keep", reason: "dirty tree (2 changed paths)", pr: null },
      },
    ],
    staleBranches: [{ name: "agent/issue-9", sha: SHA(90), pr: pr({ number: 9 }) }],
    railway: { closed: [{ name: "auto.tm-rewrite-pr-12", prNumber: 12, prState: "MERGED" }], unknown: [] },
    applied: null,
  });
  assert.match(text, /\/w\/a/);
  assert.match(text, /remove/);
  assert.match(text, /keep: dirty tree \(2 changed paths\)/);
  assert.match(text, /agent\/issue-9/);
  assert.match(text, /auto\.tm-rewrite-pr-12/);
  assert.match(text, /read-only/i);
});


const script = resolve(dirname(fileURLToPath(import.meta.url)), "worktree-gc.mjs");

function fixtureRepo(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "worktree-gc-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const main = join(root, "main");
  mkdirSync(main);
  const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  git(main, "init", "-q", "-b", "main");
  git(main, "config", "user.email", "gc@example.test");
  git(main, "config", "user.name", "GC");
  git(main, "config", "commit.gpgsign", "false");
  writeFileSync(join(main, "a.txt"), "a\n");
  git(main, "add", "a.txt");
  git(main, "commit", "-q", "-m", "base");
  const addWorktree = (name, branch) => {
    const path = join(root, name);
    git(main, "worktree", "add", "-q", "-b", branch, path);
    writeFileSync(join(path, `${name}.txt`), `${name}\n`);
    git(path, "add", `${name}.txt`);
    git(path, "commit", "-q", "-m", name);
    return { path, head: git(path, "rev-parse", "HEAD") };
  };
  const merged = addWorktree("merged", "agent/issue-1");
  const dirty = addWorktree("dirty", "agent/issue-2");
  writeFileSync(join(dirty.path, "scratch.txt"), "uncommitted\n");
  const open = addWorktree("open", "agent/issue-3");
  const locked = addWorktree("locked", "agent/issue-4");
  git(main, "worktree", "lock", "--reason", "held by test", locked.path);
  const ahead = addWorktree("ahead", "agent/issue-5");
  writeFileSync(join(ahead.path, "after-pr.txt"), "after the PR head\n");
  git(ahead.path, "add", "after-pr.txt");
  git(ahead.path, "commit", "-q", "-m", "after pr");
  const behind = addWorktree("behind", "agent/issue-6");
  writeFileSync(join(behind.path, "later.txt"), "later\n");
  git(behind.path, "add", "later.txt");
  git(behind.path, "commit", "-q", "-m", "later");
  const behindPrHead = git(behind.path, "rev-parse", "HEAD");
  git(behind.path, "reset", "-q", "--hard", behind.head);
  const prs = [
    { number: 1, state: "MERGED", headRefName: "agent/issue-1", headRefOid: merged.head, baseRefName: "main", url: "u/1" },
    { number: 2, state: "MERGED", headRefName: "agent/issue-2", headRefOid: dirty.head, baseRefName: "main", url: "u/2" },
    { number: 3, state: "OPEN", headRefName: "agent/issue-3", headRefOid: open.head, baseRefName: "main", url: "u/3" },
    { number: 4, state: "MERGED", headRefName: "agent/issue-4", headRefOid: locked.head, baseRefName: "main", url: "u/4" },
    { number: 5, state: "MERGED", headRefName: "agent/issue-5", headRefOid: ahead.head, baseRefName: "main", url: "u/5" },
    { number: 6, state: "MERGED", headRefName: "agent/issue-6", headRefOid: behindPrHead, baseRefName: "main", url: "u/6" },
  ];
  const prsFile = join(root, "prs.json");
  writeFileSync(prsFile, JSON.stringify(prs));
  const snapshot = () =>
    [git(main, "worktree", "list", "--porcelain"), git(main, "for-each-ref", "--format=%(refname) %(objectname)")].join("\n");
  const bin = join(root, "bin");
  mkdirSync(bin);
  const gc = (args, { sessions = [], fail = false, env = {} } = {}) => {
    const body = fail ? "echo 'claude: boom' >&2\nexit 1\n" : `printf '%s' '${JSON.stringify(sessions)}'\n`;
    writeFileSync(join(bin, "claude"), `#!/bin/sh\n${body}`, { mode: 0o755 });
    return spawnSync("node", [script, ...args, "--no-railway", "--no-size"], {
      cwd: main,
      encoding: "utf8",
      env: { ...process.env, HOME: main, PATH: `${bin}:${process.env.PATH}`, ...env },
    });
  };
  let nextPr = 100;
  const addMergedWorktree = (relPath, branch, base = "main") => {
    const path = join(root, relPath);
    git(main, "worktree", "add", "-q", "-b", branch, path);
    writeFileSync(join(path, "work.txt"), `${branch}\n`);
    git(path, "add", "work.txt");
    git(path, "commit", "-q", "-m", branch);
    const head = git(path, "rev-parse", "HEAD");
    nextPr += 1;
    const all = JSON.parse(readFileSync(prsFile, "utf8"));
    all.push({ number: nextPr, state: "MERGED", headRefName: branch, headRefOid: head, baseRefName: base, url: `u/${nextPr}` });
    writeFileSync(prsFile, JSON.stringify(all));
    return { path, head };
  };
  const alias = join(root, "alias");
  symlinkSync(root, alias);
  return { root, main, git, merged, dirty, open, locked, ahead, behind, prsFile, snapshot, gc, addMergedWorktree, alias };
}

const ALLOW_PRS_FILE = { WORKTREE_GC_ALLOW_PRS_FILE_APPLY: "1" };

test("the default run is read-only and reports every worktree", (t) => {
  const repo = fixtureRepo(t);
  const before = repo.snapshot();
  const result = repo.gc(["--prs-file", repo.prsFile]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(repo.snapshot(), before, "no worktree or ref changed");
  assert.match(result.stdout, /read-only/i);
  assert.match(result.stdout, /keep: dirty tree \(1 changed paths\)/);
  assert.match(result.stdout, /keep: PR #3 is open/);
  assert.match(result.stdout, /keep: locked: held by test/);
  assert.match(result.stdout, /keep: the main checkout/);
  assert.match(result.stdout, new RegExp(`${repo.merged.path}[^\\n]*\\n?[^\\n]*remove`));
});

test("--apply removes only the passing worktrees and their task branches", (t) => {
  const repo = fixtureRepo(t);
  const result = repo.gc(["--apply", "--prs-file", repo.prsFile], { env: ALLOW_PRS_FILE });
  assert.equal(result.status, 0, result.stderr);
  const list = repo.git(repo.main, "worktree", "list", "--porcelain");
  assert.ok(!list.includes(repo.merged.path), "merged worktree removed");
  assert.ok(!list.includes(repo.behind.path), "worktree at an ancestor of the merged PR head removed");
  for (const kept of [repo.dirty, repo.open, repo.locked, repo.ahead]) assert.ok(list.includes(kept.path), kept.path);
  const branches = repo.git(repo.main, "branch", "--format=%(refname:short)").split("\n");
  for (const gone of ["agent/issue-1", "agent/issue-6"]) assert.ok(!branches.includes(gone), `${gone} deleted`);
  for (const kept of ["agent/issue-2", "agent/issue-3", "agent/issue-4", "agent/issue-5", "main"]) {
    assert.ok(branches.includes(kept), kept);
  }
  assert.match(result.stdout, /removed/i);
});

test("a worktree whose HEAD is ahead of the merged PR head is kept, so commits after the PR are never lost", (t) => {
  const repo = fixtureRepo(t);
  const readOnly = repo.gc(["--prs-file", repo.prsFile]);
  assert.equal(readOnly.status, 0, readOnly.stderr);
  assert.match(readOnly.stdout, new RegExp(`${repo.ahead.path}\\n  verdict: keep: no PR match \\(HEAD is not the PR head or its ancestor`));
  assert.match(readOnly.stdout, new RegExp(`${repo.behind.path}\\n  verdict: remove \\(PR #6 merged; HEAD is an ancestor of PR #6 head`));
  const applied = repo.gc(["--apply", "--prs-file", repo.prsFile], { env: ALLOW_PRS_FILE });
  assert.equal(applied.status, 0, applied.stderr);
  assert.ok(repo.git(repo.main, "worktree", "list", "--porcelain").includes(repo.ahead.path));
  assert.equal(repo.git(repo.ahead.path, "log", "-1", "--format=%s"), "after pr");
});

test("--apply refuses a dirty worktree even when its PR merged", (t) => {
  const repo = fixtureRepo(t);
  const result = repo.gc(["--apply", "--prs-file", repo.prsFile], { env: ALLOW_PRS_FILE });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    execFileSync("git", ["status", "--porcelain"], { cwd: repo.dirty.path, encoding: "utf8" }).trim(),
    "?? scratch.txt",
  );
  assert.match(result.stdout, /keep: dirty tree/);
});

test("untracked files count as dirty whatever status.showUntrackedFiles says", (t) => {
  const repo = fixtureRepo(t);
  repo.git(repo.main, "config", "status.showUntrackedFiles", "no");
  assert.equal(repo.git(repo.dirty.path, "status", "--porcelain"), "", "the setting hides the untracked file");
  const result = repo.gc(["--apply", "--prs-file", repo.prsFile], { env: ALLOW_PRS_FILE });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /keep: dirty tree \(1 changed paths\)/);
  assert.ok(repo.git(repo.main, "worktree", "list", "--porcelain").includes(repo.dirty.path));
  assert.equal(readFileSync(join(repo.dirty.path, "scratch.txt"), "utf8"), "uncommitted\n");
});

test("--apply keeps a worktree a live Claude session works in, even with no lock", (t) => {
  const repo = fixtureRepo(t);
  const sessions = [{ pid: 4242, cwd: join(repo.merged.path, "apps"), kind: "background", name: "subagent", status: "busy" }];
  const result = repo.gc(["--apply", "--prs-file", repo.prsFile], { env: ALLOW_PRS_FILE, sessions });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /keep: running agent: pid 4242 \(claude session "subagent"\)/);
  assert.ok(repo.git(repo.main, "worktree", "list", "--porcelain").includes(repo.merged.path));
});

test("--apply stops when the Claude session list cannot be read, and a read-only run only warns", (t) => {
  const repo = fixtureRepo(t);
  const before = repo.snapshot();
  const applied = repo.gc(["--apply", "--prs-file", repo.prsFile], { env: ALLOW_PRS_FILE, fail: true });
  assert.equal(applied.status, 1);
  assert.match(applied.stderr, /Claude sessions/);
  assert.equal(repo.snapshot(), before, "nothing was removed");
  const readOnly = repo.gc(["--prs-file", repo.prsFile], { fail: true });
  assert.equal(readOnly.status, 0, readOnly.stderr);
  assert.match(readOnly.stderr, /could not read Claude sessions/);
});

test("--prs-file together with --apply is refused, so hand-written PR data cannot drive removals", (t) => {
  const repo = fixtureRepo(t);
  const before = repo.snapshot();
  const result = repo.gc(["--apply", "--prs-file", repo.prsFile]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--prs-file cannot be combined with --apply/);
  assert.equal(repo.snapshot(), before, "nothing was removed");
});


function runMain(repo, args, io = {}) {
  const out = [];
  const err = [];
  const status = main([...args, "--no-railway", "--no-size"], repo.main, {
    env: { ...process.env, HOME: repo.main, ...ALLOW_PRS_FILE },
    scanProcesses: () => [{ pid: process.pid, command: "node", cwd: repo.main }],
    scanClaudeSessions: () => ({ status: "ok", sessions: [], withoutCwd: 0 }),
    stdout: (text) => out.push(text),
    stderr: (text) => err.push(text),
    ...io,
  });
  return { status, stdout: out.join(""), stderr: err.join("\n") };
}

const hasWorktree = (repo, path) => repo.git(repo.main, "worktree", "list", "--porcelain").includes(path);


test("Codex app-managed protection does not depend on HOME", () => {
  const verdict = classifyWorktree(
    entry({ path: "/Users/dev/.codex/worktrees/1b73/auto.tm-rewrite", branch: null, detached: true }),
    context(),
  );
  assert.equal(verdict.verdict, "keep");
  assert.match(verdict.reason, /Codex app-managed worktree/);
});

test("a Codex app-managed worktree is kept when HOME points somewhere else", (t) => {
  const repo = fixtureRepo(t);
  const codex = repo.addMergedWorktree("other-home/.codex/worktrees/1b73/auto.tm-rewrite", "agent/issue-20");
  const readOnly = runMain(repo, ["--prs-file", repo.prsFile]);
  assert.equal(readOnly.status, 0, readOnly.stderr);
  assert.match(readOnly.stdout, new RegExp(`${codex.path}\\n  verdict: keep: Codex app-managed worktree`));
  const applied = runMain(repo, ["--apply", "--prs-file", repo.prsFile]);
  assert.equal(applied.status, 0, applied.stderr);
  assert.ok(hasWorktree(repo, codex.path), "the Codex worktree survived --apply");
});

test("realpathOrSelf resolves symlinks, the existing part of a missing path, and leaves the rest alone", (t) => {
  const repo = fixtureRepo(t);
  assert.equal(realpathOrSelf(join(repo.alias, "merged")), join(repo.root, "merged"));
  assert.equal(realpathOrSelf(join(repo.alias, "merged", "gone", "deeper")), join(repo.root, "merged", "gone", "deeper"));
  assert.equal(realpathOrSelf("/no-such-root-for-worktree-gc/x"), "/no-such-root-for-worktree-gc/x");
});

test("a Claude session that reaches the worktree through a symlink keeps it", (t) => {
  const repo = fixtureRepo(t);
  const sessions = [{ pid: 4242, cwd: join(repo.alias, "merged"), command: "claude session \"subagent\"" }];
  const result = runMain(repo, ["--apply", "--prs-file", repo.prsFile], {
    scanClaudeSessions: () => ({ status: "ok", sessions, withoutCwd: 0 }),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /keep: running agent: pid 4242/);
  assert.ok(hasWorktree(repo, repo.merged.path), "the worktree a session works in survived --apply");
});

test("a process that reaches the worktree through a symlink keeps it", (t) => {
  const repo = fixtureRepo(t);
  const result = runMain(repo, ["--apply", "--prs-file", repo.prsFile], {
    scanProcesses: () => [
      { pid: process.pid, command: "node", cwd: repo.main },
      { pid: 5151, command: "node", cwd: join(repo.alias, "merged") },
    ],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /keep: running agent: pid 5151 \(node\)/);
  assert.ok(hasWorktree(repo, repo.merged.path), "the worktree a process works in survived --apply");
});

test("a worktree that git lists through a final-component symlink named for prototype work is kept", (t) => {
  const repo = fixtureRepo(t);
  const plain = repo.addMergedWorktree("plain-dir", "agent/issue-30");
  const link = join(repo.root, "prototype-link");
  symlinkSync(plain.path, link);
  const gitdirFile = join(repo.git(plain.path, "rev-parse", "--absolute-git-dir"), "gitdir");
  writeFileSync(gitdirFile, `${join(link, ".git")}\n`);
  assert.ok(repo.git(repo.main, "worktree", "list", "--porcelain").includes(`worktree ${link}\n`), "git lists the symlink path");
  const readOnly = runMain(repo, ["--prs-file", repo.prsFile]);
  assert.equal(readOnly.status, 0, readOnly.stderr);
  assert.match(readOnly.stdout, new RegExp(`${plain.path}\\n  verdict: keep: evidence, prototype or research worktree`));
  const applied = runMain(repo, ["--apply", "--prs-file", repo.prsFile]);
  assert.equal(applied.status, 0, applied.stderr);
  assert.ok(hasWorktree(repo, link), "the symlinked prototype worktree survived --apply");
});


test("--apply refuses when the process scan does not include this process", (t) => {
  const repo = fixtureRepo(t);
  const before = repo.snapshot();
  const partial = () => [{ pid: 1, command: "launchd", cwd: "/" }];
  const applied = runMain(repo, ["--apply", "--prs-file", repo.prsFile], { scanProcesses: partial });
  assert.equal(applied.status, 1);
  assert.match(applied.stderr, /did not include this process/);
  assert.equal(repo.snapshot(), before, "nothing was removed");
});

test("a read-only run warns when the process scan does not include this process", (t) => {
  const repo = fixtureRepo(t);
  const before = repo.snapshot();
  const readOnly = runMain(repo, ["--prs-file", repo.prsFile], { scanProcesses: () => [{ pid: 1, command: "launchd", cwd: "/" }] });
  assert.equal(readOnly.status, 0, readOnly.stderr);
  assert.match(readOnly.stderr, /did not include this process/);
  assert.equal(repo.snapshot(), before);
});

test("--apply proceeds when the process scan includes this process", (t) => {
  const repo = fixtureRepo(t);
  const applied = runMain(repo, ["--apply", "--prs-file", repo.prsFile]);
  assert.equal(applied.status, 0, applied.stderr);
  assert.ok(!hasWorktree(repo, repo.merged.path), "the passing worktree was removed");
});


test("a Claude session without a working directory is skipped and counted, not a reason to distrust the whole list", () => {
  const parsed = parseClaudeSessions(
    JSON.stringify([
      { pid: 41, cwd: `${MAIN}/.claude/worktrees/issue-1`, name: "local" },
      { pid: 42, kind: "remote", name: "cloud" },
      { pid: 43, cwd: "", name: "blank" },
      { pid: 44, cwd: 7, name: "wrong type" },
    ]),
  );
  assert.deepEqual(parsed, {
    sessions: [{ pid: 41, command: 'claude session "local"', cwd: `${MAIN}/.claude/worktrees/issue-1` }],
    withoutCwd: 3,
  });
});

test("a non-empty Claude session list in which no entry has a working directory is unreadable", () => {
  const entries = [{ pid: 42, kind: "remote", name: "cloud" }, { pid: 43, cwd: "", name: "blank" }, { pid: 44, cwd: 7, name: "wrong type" }];
  assert.equal(parseClaudeSessions(JSON.stringify(entries)), null);
  assert.equal(parseClaudeSessions(JSON.stringify([{ pid: 41, workdir: "/a" }, { pid: 42, workdir: "/b" }])), null);
});

test("an entry that is not a plain object makes the whole Claude session list unreadable", () => {
  assert.equal(parseClaudeSessions("[[]]"), null);
  assert.equal(parseClaudeSessions(JSON.stringify([[{ pid: 1, cwd: "/a" }]])), null);
  assert.equal(parseClaudeSessions(JSON.stringify([{ pid: 41, cwd: "/a" }, []])), null);
});

test("a mixed Claude session list still skips and counts the entries without a directory, and an empty one has no sessions", () => {
  const mixed = parseClaudeSessions(JSON.stringify([{ pid: 41, cwd: "/a", name: "local" }, { pid: 42, kind: "remote" }]));
  assert.deepEqual(mixed, { sessions: [{ pid: 41, command: 'claude session "local"', cwd: "/a" }], withoutCwd: 1 });
  assert.deepEqual(parseClaudeSessions("[]"), { sessions: [], withoutCwd: 0 });
});

test("--apply refuses when no Claude session entry has a working directory, and a read-only run only warns", (t) => {
  const repo = fixtureRepo(t);
  const before = repo.snapshot();
  const sessions = [{ pid: 7, kind: "remote", name: "cloud" }, { pid: 8, workdir: repo.merged.path, name: "renamed field" }];
  const applied = repo.gc(["--apply", "--prs-file", repo.prsFile], { env: ALLOW_PRS_FILE, sessions });
  assert.equal(applied.status, 1, applied.stderr);
  assert.match(applied.stderr, /Cannot read Claude sessions/);
  assert.equal(repo.snapshot(), before, "nothing was removed");
  const readOnly = repo.gc(["--prs-file", repo.prsFile], { sessions });
  assert.equal(readOnly.status, 0, readOnly.stderr);
  assert.match(readOnly.stderr, /could not read Claude sessions/);
  assert.match(readOnly.stdout, /Claude sessions: not checked/);
});

test("--apply refuses when a Claude session entry is a nested array", (t) => {
  const repo = fixtureRepo(t);
  const before = repo.snapshot();
  const applied = repo.gc(["--apply", "--prs-file", repo.prsFile], { env: ALLOW_PRS_FILE, sessions: [[]] });
  assert.equal(applied.status, 1, applied.stderr);
  assert.match(applied.stderr, /Cannot read Claude sessions/);
  assert.equal(repo.snapshot(), before, "nothing was removed");
});

test("--apply with a mixed Claude session list warns about the entry without a directory and still removes", (t) => {
  const repo = fixtureRepo(t);
  const sessions = [{ pid: 9, cwd: repo.main, name: "orchestrator" }, { pid: 10, kind: "remote", name: "cloud" }];
  const applied = repo.gc(["--apply", "--prs-file", repo.prsFile], { env: ALLOW_PRS_FILE, sessions });
  assert.equal(applied.status, 0, applied.stderr);
  assert.match(applied.stderr, /1 Claude session has no working directory/);
  assert.ok(!hasWorktree(repo, repo.merged.path), "the passing worktree was removed");
});

test("--apply with an empty Claude session list is a valid no-sessions scan", (t) => {
  const repo = fixtureRepo(t);
  const applied = repo.gc(["--apply", "--prs-file", repo.prsFile], { env: ALLOW_PRS_FILE, sessions: [] });
  assert.equal(applied.status, 0, applied.stderr);
  assert.equal(applied.stderr, "");
  assert.match(applied.stdout, /Claude sessions: checked \(0 with a directory\)/);
  assert.ok(!hasWorktree(repo, repo.merged.path), "the passing worktree was removed");
});

test("a missing claude binary is reported as not checked, never as an empty session list", () => {
  const missing = scanClaudeSessions(() => ({ error: Object.assign(new Error("spawn claude ENOENT"), { code: "ENOENT" }) }));
  assert.deepEqual(missing, { status: "missing", sessions: [], withoutCwd: 0 });
});

test("a claude run that exits non-zero, times out or prints nothing is an unreadable scan", () => {
  assert.equal(scanClaudeSessions(() => ({ status: 1, stdout: "[]" })), null);
  assert.equal(scanClaudeSessions(() => ({ error: Object.assign(new Error("spawnSync claude ETIMEDOUT"), { code: "ETIMEDOUT" }), status: null, stdout: "" })), null);
  assert.equal(scanClaudeSessions(() => ({ status: 0, stdout: "" })), null);
  assert.deepEqual(scanClaudeSessions(() => ({ status: 0, stdout: "[]" })), { status: "ok", sessions: [], withoutCwd: 0 });
});

test("a missing claude binary warns, and the report says Claude sessions were not checked", (t) => {
  const repo = fixtureRepo(t);
  const missing = () => ({ status: "missing", sessions: [], withoutCwd: 0 });
  const readOnly = runMain(repo, ["--prs-file", repo.prsFile], { scanClaudeSessions: missing });
  assert.equal(readOnly.status, 0, readOnly.stderr);
  assert.match(readOnly.stderr, /`claude` was not found/);
  assert.match(readOnly.stdout, /Claude sessions: not checked/);
  const applied = runMain(repo, ["--apply", "--prs-file", repo.prsFile], { scanClaudeSessions: missing });
  assert.equal(applied.status, 0, applied.stderr);
  assert.match(applied.stderr, /`claude` was not found/);
  assert.match(applied.stdout, /Completion report[\s\S]*Claude sessions: not checked/);
});

test("Claude sessions without a working directory are named in the report and as a warning, and alone stop --apply", (t) => {
  const repo = fixtureRepo(t);
  const before = repo.snapshot();
  const remote = [{ pid: 10, kind: "remote", name: "cloud" }, { pid: 11, kind: "remote", name: "cloud 2" }];
  const unreadable = repo.gc(["--apply", "--prs-file", repo.prsFile], { env: ALLOW_PRS_FILE, sessions: remote });
  assert.equal(unreadable.status, 1, unreadable.stderr);
  assert.match(unreadable.stderr, /Cannot read Claude sessions/);
  assert.equal(repo.snapshot(), before, "nothing was removed");
  const sessions = [{ pid: 9, cwd: repo.main, name: "orchestrator" }, ...remote];
  const result = repo.gc(["--apply", "--prs-file", repo.prsFile], { env: ALLOW_PRS_FILE, sessions });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /2 Claude sessions have no working directory/);
  assert.match(result.stdout, /Claude sessions: checked \(1 with a directory, 2 without one are not matched to any worktree\)/);
});

test("a clean Claude session scan is stated in the report with no warning", (t) => {
  const repo = fixtureRepo(t);
  const sessions = [{ pid: 9, command: 'claude session "orchestrator"', cwd: repo.main }];
  const result = runMain(repo, ["--prs-file", repo.prsFile], {
    scanClaudeSessions: () => ({ status: "ok", sessions, withoutCwd: 0 }),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /Claude sessions: checked \(1 with a directory\)/);
  assert.match(result.stdout, /Process scan: includes this process \(1 processes\)/);
  assert.doesNotMatch(result.stdout, /Process scan: complete/);
});

test("the JSON report records what each scan covered", (t) => {
  const repo = fixtureRepo(t);
  const result = runMain(repo, ["--json", "--prs-file", repo.prsFile], {
    scanClaudeSessions: () => ({ status: "missing", sessions: [], withoutCwd: 0 }),
  });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.scans?.claude?.status, "missing");
  assert.equal(report.scans?.processes?.includesCurrentProcess, true);
  assert.equal(report.scans?.processes?.status, "includes-current-process");
  assert.equal(report.scans?.processes?.count, 1);
});

test("the report and the JSON say when the process scan does not include this process", (t) => {
  const repo = fixtureRepo(t);
  const partial = () => [{ pid: 1, command: "launchd", cwd: "/" }];
  const text = runMain(repo, ["--prs-file", repo.prsFile], { scanProcesses: partial });
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /Process scan: does not include this process \(1 processes\), so running agents may be missed/);
  const json = JSON.parse(runMain(repo, ["--json", "--prs-file", repo.prsFile], { scanProcesses: partial }).stdout);
  assert.equal(json.scans.processes.status, "excludes-current-process");
  assert.equal(json.scans.processes.includesCurrentProcess, false);
  const unavailable = runMain(repo, ["--prs-file", repo.prsFile], { scanProcesses: () => null });
  assert.match(unavailable.stdout, /Process scan: not checked \(the process list could not be read\)/);
  assert.equal(JSON.parse(runMain(repo, ["--json", "--prs-file", repo.prsFile], { scanProcesses: () => null }).stdout).scans.processes.status, "unavailable");
});


function realExec(before) {
  return (argv, cwd) => {
    before(argv);
    return execFileSync(argv[0], argv.slice(1), { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  };
}

function applyWhileMutatingSecondRemoval(repo, mutate) {
  let started = false;
  const result = runMain(repo, ["--apply", "--prs-file", repo.prsFile], {
    exec: realExec((argv) => {
      if (started || argv[1] !== "worktree" || argv[2] !== "remove") return;
      started = true;
      mutate(argv[3] === repo.merged.path ? repo.behind : repo.merged, argv[3] === repo.merged.path ? "behind" : "merged");
    }),
  });
  assert.ok(started, "a worktree removal ran");
  return result;
}

test("--apply stops before removing a worktree whose HEAD moved after the scan", (t) => {
  const repo = fixtureRepo(t);
  const moved = [];
  const result = applyWhileMutatingSecondRemoval(repo, (other, name) => {
    repo.git(other.path, "commit", "-q", "--allow-empty", "-m", "moved after the scan");
    moved.push([other, name]);
  });
  const [[other, name]] = moved;
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, new RegExp(`FAILED at: remove worktree ${other.path}`));
  assert.match(result.stdout, /HEAD moved from/);
  assert.ok(hasWorktree(repo, other.path), `${name} was not removed`);
  assert.equal(repo.git(other.path, "log", "-1", "--format=%s"), "moved after the scan", "the new commit is intact");
  const branches = repo.git(repo.main, "branch", "--format=%(refname:short)").split("\n");
  assert.ok(branches.includes(name === "merged" ? "agent/issue-1" : "agent/issue-6"), "its branch was not deleted either");
  assert.match(result.stdout, /not attempted: [1-9]/);
});

test("--apply stops before removing a worktree that was dirtied after the scan", (t) => {
  const repo = fixtureRepo(t);
  const dirtied = [];
  const result = applyWhileMutatingSecondRemoval(repo, (other) => {
    writeFileSync(join(other.path, "late.txt"), "written after the scan\n");
    dirtied.push(other);
  });
  const [other] = dirtied;
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, new RegExp(`FAILED at: remove worktree ${other.path}`));
  assert.match(result.stdout, /worktree is no longer clean/);
  assert.ok(hasWorktree(repo, other.path));
  assert.equal(readFileSync(join(other.path, "late.txt"), "utf8"), "written after the scan\n");
});

test("--apply refuses to run when the process scan returns nothing usable, and a read-only run warns", (t) => {
  const repo = fixtureRepo(t);
  const before = repo.snapshot();
  const applied = runMain(repo, ["--apply", "--prs-file", repo.prsFile], { scanProcesses: () => null });
  assert.equal(applied.status, 1);
  assert.match(applied.stderr, /Cannot scan running processes, so --apply refuses to remove anything/);
  assert.equal(repo.snapshot(), before, "nothing was removed");
  const readOnly = runMain(repo, ["--prs-file", repo.prsFile], { scanProcesses: () => null });
  assert.equal(readOnly.status, 0, readOnly.stderr);
  assert.match(readOnly.stderr, /could not scan running processes/);
  assert.equal(repo.snapshot(), before);
});

test("a stale branch that moved after the scan fails the conditional delete, and the branch is kept", (t) => {
  const repo = fixtureRepo(t);
  repo.git(repo.main, "branch", "agent/issue-7", repo.merged.head);
  const base = repo.git(repo.main, "rev-parse", "main");
  const readOnly = runMain(repo, ["--prs-file", repo.prsFile]);
  assert.match(readOnly.stdout, /agent\/issue-7 at /, "the scan lists it as stale");
  let moved = false;
  const result = runMain(repo, ["--apply", "--prs-file", repo.prsFile], {
    exec: realExec(() => {
      if (moved) return;
      moved = true;
      repo.git(repo.main, "update-ref", "refs/heads/agent/issue-7", base);
    }),
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /FAILED at: delete branch agent\/issue-7 at/);
  assert.match(result.stdout, /expected/, "git's own mismatch message is reported");
  assert.equal(repo.git(repo.main, "rev-parse", "refs/heads/agent/issue-7"), base, "the moved branch was not deleted");
  assert.ok(!hasWorktree(repo, repo.merged.path), "the earlier removal had already happened");
});


test("--prs-file without a path is a usage error, not a silent fall back to gh", () => {
  for (const argv of [["--prs-file"], ["--prs-file", "--apply"]]) {
    const err = [];
    const status = main(argv, "/", { stdout: () => {}, stderr: (text) => err.push(text) });
    assert.equal(status, 2, argv.join(" "));
    assert.match(err.join("\n"), /--prs-file needs a path/, argv.join(" "));
  }
});

function fakeGh(total) {
  const limits = [];
  const fields = [];
  const runCommand = (argv) => {
    const limit = Number(argv[argv.indexOf("--limit") + 1]);
    limits.push(limit);
    fields.push(argv[argv.indexOf("--json") + 1]);
    return JSON.stringify(Array.from({ length: Math.min(limit, total) }, (_, i) => ({ number: i + 1 })));
  };
  return { runCommand, limits, fields };
}

test("loadPrs makes one call for a short list and asks for baseRefName", () => {
  const gh = fakeGh(3);
  const loaded = loadPrs(null, "/", gh.runCommand);
  assert.equal(loaded.prs.length, 3);
  assert.equal(loaded.truncated, false);
  assert.deepEqual(gh.limits, [1000]);
  assert.match(gh.fields[0], /(^|,)baseRefName(,|$)/);
});

test("loadPrs asks for a larger list when the result fills the limit", () => {
  const gh = fakeGh(1500);
  const loaded = loadPrs(null, "/", gh.runCommand);
  assert.equal(loaded.prs.length, 1500);
  assert.equal(loaded.truncated, false);
  assert.deepEqual(gh.limits, [1000, 5000]);
});

test("loadPrs reports truncation when even the largest limit is full", () => {
  const gh = fakeGh(Number.MAX_SAFE_INTEGER);
  const loaded = loadPrs(null, "/", gh.runCommand);
  assert.equal(loaded.truncated, true);
  assert.deepEqual(gh.limits, [1000, 5000, 20000]);
  assert.equal(loaded.prs.length, 20000);
});

test("a possibly truncated PR list warns on a read-only run and stops --apply", (t) => {
  const repo = fixtureRepo(t);
  const prs = JSON.parse(readFileSync(repo.prsFile, "utf8"));
  const io = { loadPrs: () => ({ prs, truncated: true }) };
  const before = repo.snapshot();
  const applied = runMain(repo, ["--apply"], io);
  assert.equal(applied.status, 1);
  assert.match(applied.stderr, /PR list may be truncated/);
  assert.equal(repo.snapshot(), before, "nothing was removed");
  const readOnly = runMain(repo, [], io);
  assert.equal(readOnly.status, 0, readOnly.stderr);
  assert.match(readOnly.stderr, /PR list may be truncated/);
});


test("a PR merged into a branch other than main keeps the worktree, since the work is not on main yet", () => {
  const verdict = classifyWorktree(entry(), context({ prs: [pr({ baseRefName: "agent/issue-0" })] }));
  assert.equal(verdict.verdict, "keep");
  assert.match(verdict.reason, /^PR #12 merged into agent\/issue-0, not main/);
});

test("a merged PR with no recorded base is not assumed to be on main", () => {
  const verdict = classifyWorktree(entry(), context({ prs: [pr({ baseRefName: undefined })] }));
  assert.equal(verdict.verdict, "keep");
  assert.match(verdict.reason, /^PR #12 merged into an unknown base, not main/);
});

test("a PR merged into main still removes the worktree when another matching PR merged into a stacked base", () => {
  const verdict = classifyWorktree(
    entry(),
    context({ prs: [pr({ number: 3, baseRefName: "agent/issue-0" }), pr({ number: 4, baseRefName: "main" })] }),
  );
  assert.equal(verdict.verdict, "remove");
  assert.match(verdict.reason, /PR #4 merged/);
});

test("a branch inside a PR merged into a stacked base is not a stale branch", () => {
  const stale = findStaleBranches({
    branches: [{ name: "agent/issue-2", sha: SHA(20) }],
    worktrees: [],
    prs: [pr({ number: 20, headRefName: "agent/issue-2", headRefOid: SHA(20), baseRefName: "agent/issue-1" })],
    isAncestor: () => false,
  });
  assert.deepEqual(stale, []);
});

test("a worktree whose PR merged into a stacked base is kept by --apply, branch and all", (t) => {
  const repo = fixtureRepo(t);
  const stacked = repo.addMergedWorktree("stacked", "agent/issue-30", "agent/issue-29");
  const readOnly = runMain(repo, ["--prs-file", repo.prsFile]);
  assert.match(readOnly.stdout, new RegExp(`${stacked.path}\\n  verdict: keep: PR #101 merged into agent/issue-29, not main`));
  const applied = runMain(repo, ["--apply", "--prs-file", repo.prsFile]);
  assert.equal(applied.status, 0, applied.stderr);
  assert.ok(hasWorktree(repo, stacked.path), "the stacked worktree survived");
  assert.ok(repo.git(repo.main, "branch", "--format=%(refname:short)").split("\n").includes("agent/issue-30"));
});


test("a stale branch is flagged when its tip is on main", () => {
  const stale = findStaleBranches({
    branches: [
      { name: "worktree-agent-abc", sha: SHA(40) },
      { name: "agent/issue-2", sha: SHA(20) },
    ],
    worktrees: [],
    prs: [
      pr({ number: 20, headRefName: "agent/issue-2", headRefOid: SHA(20) }),
      pr({ number: 41, headRefName: "x", headRefOid: SHA(41) }),
    ],
    mainSha: SHA(99),
    isAncestor: (a, b) => a === SHA(40) && (b === SHA(41) || b === SHA(99)),
  });
  assert.deepEqual(stale.map((item) => [item.name, item.onMain]), [
    ["worktree-agent-abc", true],
    ["agent/issue-2", false],
  ]);
});

test("the report labels a stale branch on main as such and keeps the PR label for the rest", () => {
  const text = formatReport({
    rows: [],
    staleBranches: [
      { name: "worktree-agent-abc", sha: SHA(40), pr: pr({ number: 41 }), onMain: true },
      { name: "agent/issue-2", sha: SHA(20), pr: pr({ number: 20 }), onMain: false },
    ],
    railway: null,
    applied: null,
  });
  assert.match(text, /worktree-agent-abc at a{9} \(on main\)/);
  assert.match(text, /agent\/issue-2 at a{9} \(PR #20 merged\)/);
  assert.doesNotMatch(text, /worktree-agent-abc[^\n]*PR #41/);
});

test("--apply still deletes stale branches, and the report says which tips are on main", (t) => {
  const repo = fixtureRepo(t);
  const base = repo.git(repo.main, "rev-parse", "main");
  repo.git(repo.main, "branch", "worktree-agent-scaffold", base);
  repo.git(repo.main, "branch", "agent/issue-8", repo.merged.head);
  const readOnly = runMain(repo, ["--prs-file", repo.prsFile]);
  assert.match(readOnly.stdout, new RegExp(`worktree-agent-scaffold at ${base.slice(0, 9)} \\(on main\\)`));
  assert.match(readOnly.stdout, new RegExp(`agent/issue-8 at ${repo.merged.head.slice(0, 9)} \\(PR #1 merged\\)`));
  const applied = runMain(repo, ["--apply", "--prs-file", repo.prsFile]);
  assert.equal(applied.status, 0, applied.stderr);
  const branches = repo.git(repo.main, "branch", "--format=%(refname:short)").split("\n");
  assert.ok(!branches.includes("worktree-agent-scaffold"));
  assert.ok(!branches.includes("agent/issue-8"));
});
