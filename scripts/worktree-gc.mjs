#!/usr/bin/env node
// A safe worktree cleanup gate as code (originally docs/agents/worktree-lifecycle.md, retired by ADR-0108).
//
// Default run is read-only: it lists every linked worktree with a verdict,
// `remove` or `keep: <exact reason>`, plus stale local branches and Railway PR
// environments whose PR is closed. `--apply` then removes only `remove` rows
// with `git worktree remove` (never --force), deletes their task and scaffold
// branches with a conditional `git update-ref -d <ref> <expected-sha>`, and
// prunes. It stops at the first failure.
//
// Usage: node scripts/worktree-gc.mjs [--apply] [--json] [--no-size]
//          [--no-railway] [--prs-file <json>]
// `--prs-file` is for read-only experiments; `--apply` refuses it.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, readlinkSync, realpathSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ZERO_SHA = /^0+$/;
const EVIDENCE = /(^|[/_-])(evidence|prototype|research)([/_-]|$)/i;
const MAIN_BRANCH = "main";
const TASK_BRANCH = "agent/issue-";
const SCAFFOLD_BRANCH = "worktree-agent-";

export function parseWorktreePorcelain(text) {
  const entries = [];
  for (const block of text.split(/\n\s*\n/)) {
    const lines = block.split("\n").filter(Boolean);
    if (!lines.length || !lines[0].startsWith("worktree ")) continue;
    const entry = {
      path: lines[0].slice("worktree ".length),
      head: null,
      branch: null,
      detached: false,
      bare: false,
      locked: false,
      lockReason: null,
      prunable: false,
    };
    for (const line of lines.slice(1)) {
      if (line.startsWith("HEAD ")) entry.head = line.slice(5);
      else if (line.startsWith("branch ")) entry.branch = line.slice(7).replace(/^refs\/heads\//, "");
      else if (line === "detached") entry.detached = true;
      else if (line === "bare") entry.bare = true;
      else if (line === "locked" || line.startsWith("locked ")) {
        entry.locked = true;
        entry.lockReason = line.slice("locked".length).trim();
      } else if (line === "prunable" || line.startsWith("prunable ")) entry.prunable = true;
    }
    entries.push(entry);
  }
  return entries;
}

// `claude agents --json` output as running-process records. A Claude session
// may run in a worktree that holds no lock, so its cwd counts as a running
// agent. Anything unreadable is unknown (null), never an empty list.
export function parseClaudeSessions(text) {
  let sessions;
  try {
    sessions = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(sessions)) return null;
  const found = [];
  let withoutCwd = 0;
  for (const session of sessions) {
    // An entry that is not a plain object means the format is not what we expect.
    if (!session || typeof session !== "object" || Array.isArray(session)) return null;
    // A session with no directory (a remote one, say) cannot sit in any
    // worktree, so it cannot be matched. Among sessions that do have one it is
    // counted and reported, not silently dropped.
    if (typeof session.cwd !== "string" || !session.cwd) {
      withoutCwd += 1;
      continue;
    }
    found.push({ pid: session.pid ?? "?", command: `claude session "${session.name ?? session.sessionId ?? "unnamed"}"`, cwd: session.cwd });
  }
  // A non-empty list in which no entry has a directory is the signature of a
  // changed format (the field renamed or nested), not of "no local sessions":
  // it is unreadable, so --apply refuses.
  if (!found.length && withoutCwd > 0) return null;
  return { sessions: found, withoutCwd };
}

// Resolves symlinks so a path from `lsof` or a Claude session compares equal
// to the path git lists. A path that does not exist (a deleted worktree)
// keeps its missing tail and resolves only the part that does exist; a path
// with no existing ancestor comes back unchanged.
export function realpathOrSelf(path) {
  let existing = path;
  const tail = [];
  for (;;) {
    try {
      return join(realpathSync(existing), ...tail.reverse());
    } catch {
      const parent = dirname(existing);
      if (parent === existing) return path;
      tail.push(basename(existing));
      existing = parent;
    }
  }
}

function inside(cwd, path) {
  return cwd === path || cwd.startsWith(`${path}/`);
}

// Codex keeps its app-managed worktrees under `<home>/.codex/worktrees/`. Match
// the directory wherever it sits, so a different HOME (a sandbox, sudo, a
// wrapper) does not strip the protection.
const CODEX_MANAGED = "/.codex/worktrees/";

function isCodexManaged(entry) {
  return [entry.path, entry.listedPath].some((path) => path && `${path}/`.includes(CODEX_MANAGED));
}

// The branch, or the directory's name as git lists it or as it resolves (a
// final-component symlink can carry the evidence name on either side).
function isEvidenceWorktree(entry) {
  return EVIDENCE.test(entry.branch ?? "") || [entry.path, entry.listedPath].some((path) => path && EVIDENCE.test(basename(path)));
}

function matchingPrs(entry, context) {
  const { prs, onMain, isAncestor } = context;
  const sameName = entry.branch ? prs.filter((pr) => pr.headRefName === entry.branch) : [];
  // This branch's own open PR decides, whatever other branches' merged PRs contain.
  const ownOpen = sameName.find((pr) => pr.state === "OPEN");
  if (ownOpen) return { prs: [ownOpen], how: "own-open" };
  const direct = prs.filter((pr) => pr.headRefOid === entry.head);
  if (direct.length) return { prs: direct, how: "head" };
  if (onMain) return { prs: [], how: null };
  const ancestors = (candidates) => candidates.filter((pr) => isAncestor(entry.head, pr.headRefOid) === true);
  const found = ancestors(sameName);
  if (found.length) return { prs: found, how: "ancestor" };
  const others = ancestors(prs.filter((pr) => !sameName.includes(pr)));
  return others.length ? { prs: others, how: "ancestor" } : { prs: [], how: null };
}

// First matching keep reason wins. Order puts identity and ownership checks
// ahead of work-in-progress checks, and PR state last.
export function classifyWorktree(entry, context) {
  const keep = (reason) => ({ verdict: "keep", reason, pr: null });
  if (entry.path === context.mainPath) return keep("the main checkout");
  if (isCodexManaged(entry)) {
    return keep("Codex app-managed worktree (~/.codex/worktrees)");
  }
  if (entry.path === context.currentPath) return keep("the current session's own worktree");
  if (entry.locked) {
    if (/^claude session/.test(entry.lockReason ?? "")) {
      return keep(`another session's worktree (locked: ${entry.lockReason})`);
    }
    return keep(entry.lockReason ? `locked: ${entry.lockReason}` : "locked");
  }
  const running = (context.activeProcesses ?? []).find((proc) => inside(proc.cwd, entry.path));
  if (running) return keep(`running agent: pid ${running.pid} (${running.command}) works in it`);
  if (entry.prunable) return keep("directory is missing (prunable); git worktree prune clears the entry");
  if (!entry.head || ZERO_SHA.test(entry.head)) return keep("unborn branch");
  if (isEvidenceWorktree(entry)) {
    return keep("evidence, prototype or research worktree");
  }
  if (context.dirtyCount === null) return keep("status could not be read");
  if (context.dirtyCount > 0) return keep(`dirty tree (${context.dirtyCount} changed paths)`);

  const { prs, how } = matchingPrs(entry, context);
  if (!prs.length) {
    const sameBranch = entry.branch && context.prs.some((pr) => pr.headRefName === entry.branch);
    const detail = context.onMain
      ? "HEAD is already on main and belongs to no PR"
      : sameBranch
        ? "HEAD is not the PR head or its ancestor, so it may hold commits the PR lacks"
        : "no PR head equals HEAD or descends from it";
    return keep(`no PR match (${detail})`);
  }
  const open = prs.find((pr) => pr.state === "OPEN");
  if (open) return { verdict: "keep", reason: `PR #${open.number} is open`, pr: open };
  const mergedPrs = prs.filter((pr) => pr.state === "MERGED");
  if (mergedPrs.length) {
    // A PR merged into a stacked parent branch has not reached main, so its
    // work is not on main yet. Only a merge into main lets the worktree go.
    const merged = mergedPrs.find((pr) => pr.baseRefName === MAIN_BRANCH);
    if (!merged) {
      const first = mergedPrs[0];
      return { verdict: "keep", reason: `PR #${first.number} merged into ${first.baseRefName ?? "an unknown base"}, not ${MAIN_BRANCH}; the work is not on ${MAIN_BRANCH} yet`, pr: first };
    }
    const relation = how === "head" ? "HEAD is the PR head" : `HEAD is an ancestor of PR #${merged.number} head`;
    return { verdict: "remove", reason: `PR #${merged.number} merged; ${relation}`, pr: merged };
  }
  return { verdict: "keep", reason: `PR #${prs[0].number} closed without merging`, pr: prs[0] };
}

function isManagedBranch(name) {
  return name.startsWith(TASK_BRANCH) || name.startsWith(SCAFFOLD_BRANCH);
}

// Local task and scaffold branches that no worktree holds and whose tip is
// already inside a merged PR head.
export function findStaleBranches({ branches, worktrees, prs, isAncestor, mainSha = null }) {
  const held = new Set(worktrees.map((entry) => entry.branch).filter(Boolean));
  const mergedPrs = prs.filter((pr) => pr.state === "MERGED" && pr.baseRefName === MAIN_BRANCH);
  const stale = [];
  for (const branch of branches) {
    if (!isManagedBranch(branch.name) || held.has(branch.name)) continue;
    const contains = (pr) => pr.headRefOid === branch.sha || isAncestor(branch.sha, pr.headRefOid) === true;
    const sameName = mergedPrs.filter((pr) => pr.headRefName === branch.name);
    const pr = sameName.find(contains) ?? mergedPrs.find((candidate) => !sameName.includes(candidate) && contains(candidate));
    // A tip already on main is reported as such, whichever PR also contains it.
    const onMain = Boolean(mainSha) && isAncestor(branch.sha, mainSha) === true;
    if (pr) stale.push({ name: branch.name, sha: branch.sha, pr, onMain });
  }
  return stale;
}

export function findStaleRailwayEnvironments({ environments, prs }) {
  const result = { closed: [], unknown: [] };
  for (const environment of environments) {
    if (!environment.isEphemeral) continue;
    const prNumber = environment.meta?.prNumber ?? Number(/-pr-(\d+)$/.exec(environment.name)?.[1]);
    if (!prNumber) continue;
    const pr = prs.find((candidate) => candidate.number === prNumber);
    if (!pr) result.unknown.push({ id: environment.id, name: environment.name, prNumber });
    else if (pr.state !== "OPEN") {
      result.closed.push({ id: environment.id, name: environment.name, prNumber, prState: pr.state });
    }
  }
  return result;
}

// Ordered steps for --apply. Worktrees go first, then conditional ref
// deletes, then prune. Nothing here forces anything.
export function planApply({ rows, staleBranches }) {
  const steps = [];
  const refs = [];
  for (const { entry, verdict } of rows) {
    if (verdict.verdict !== "remove") continue;
    steps.push({ label: `remove worktree ${entry.path}`, kind: "worktree", entry, argv: ["git", "worktree", "remove", entry.path] });
    if (entry.branch && isManagedBranch(entry.branch)) refs.push({ name: entry.branch, sha: entry.head });
  }
  for (const stale of staleBranches) refs.push({ name: stale.name, sha: stale.sha });
  for (const ref of refs) {
    steps.push({
      label: `delete branch ${ref.name} at ${ref.sha.slice(0, 9)}`,
      kind: "ref",
      argv: ["git", "update-ref", "-d", `refs/heads/${ref.name}`, ref.sha],
    });
  }
  steps.push({ label: "prune worktree metadata", kind: "prune", argv: ["git", "worktree", "prune"] });
  return steps;
}

export function runApply(steps, exec) {
  const result = { done: [], failed: null, skipped: [] };
  for (const [index, step] of steps.entries()) {
    try {
      step.verify?.();
      exec(step.argv);
      result.done.push(step);
    } catch (error) {
      result.failed = { step, error: String(error.stderr || error.message || error).trim() };
      result.skipped = steps.slice(index + 1);
      break;
    }
  }
  return result;
}

function humanSize(kb) {
  if (kb === null || kb === undefined) return "n/a";
  if (kb >= 1024 * 1024) return `${(kb / 1024 / 1024).toFixed(1)} GB`;
  if (kb >= 1024) return `${Math.round(kb / 1024)} MB`;
  return `${kb} KB`;
}

// One line saying what the Claude session scan covered. The report never
// implies the scan ran when it did not.
function describeClaudeScan(claude) {
  if (!claude) return "not recorded";
  if (claude.status === "missing") return "not checked (`claude` was not found on PATH)";
  if (claude.status !== "ok") return "not checked (the session list could not be read)";
  const unmatched = claude.withoutCwd ? `, ${claude.withoutCwd} without one ${claude.withoutCwd === 1 ? "is" : "are"} not matched to any worktree` : "";
  return `checked (${claude.sessions} with a directory${unmatched})`;
}

function describeProcessScan(processes) {
  if (!processes) return "not recorded";
  if (processes.status === "unavailable") return "not checked (the process list could not be read)";
  if (processes.status === "excludes-current-process") {
    return `does not include this process (${processes.count} processes), so running agents may be missed`;
  }
  return `includes this process (${processes.count} processes)`;
}

export function formatReport({ rows, staleBranches, railway, applied, scans }) {
  const out = [];
  out.push(
    applied
      ? "Mode: --apply (removed only `remove` rows, no --force)"
      : "Mode: read-only (nothing was changed; pass --apply to remove `remove` rows)",
  );
  out.push("");
  out.push(`Linked worktrees: ${rows.length}`);
  for (const { entry, size, dirtyCount, verdict } of rows) {
    out.push("");
    out.push(entry.path);
    out.push(`  verdict: ${verdict.verdict === "remove" ? `remove (${verdict.reason})` : `keep: ${verdict.reason}`}`);
    const lock = entry.locked ? `locked${entry.lockReason ? ` (${entry.lockReason})` : ""}` : "no";
    const pr = verdict.pr ? `#${verdict.pr.number} ${verdict.pr.state}` : "none";
    out.push(
      `  branch: ${entry.branch ?? "(detached)"}  HEAD: ${(entry.head ?? "").slice(0, 9)}  size: ${size ?? "n/a"}  lock: ${lock}  changed: ${dirtyCount ?? "?"}  PR: ${pr}`,
    );
  }
  const remove = rows.filter((row) => row.verdict.verdict === "remove").length;
  out.push("");
  out.push(`Summary: ${remove} remove, ${rows.length - remove} keep`);
  if (scans) {
    out.push("");
    out.push(`Process scan: ${describeProcessScan(scans.processes)}`);
    out.push(`Claude sessions: ${describeClaudeScan(scans.claude)}`);
  }

  out.push("");
  out.push(`Stale local branches (no worktree, tip inside a merged PR head): ${staleBranches.length}`);
  for (const stale of staleBranches) {
    out.push(`  ${stale.name} at ${stale.sha.slice(0, 9)} (${stale.onMain ? `on ${MAIN_BRANCH}` : `PR #${stale.pr.number} merged`})`);
  }

  out.push("");
  if (!railway) out.push("Railway PR environments: not checked");
  else if (railway.error) out.push(`Railway PR environments: not checked (${railway.error})`);
  else {
    out.push(`Railway PR environments whose PR is closed: ${railway.closed.length} (report only; Railway deletes them itself)`);
    for (const env of railway.closed) out.push(`  ${env.name} (PR #${env.prNumber} ${env.prState})`);
    for (const env of railway.unknown) out.push(`  ${env.name}: PR #${env.prNumber} not found, state unknown`);
  }

  if (applied) {
    out.push("");
    out.push("Completion report");
    const removed = applied.done.filter((step) => step.kind === "worktree");
    const refs = applied.done.filter((step) => step.kind === "ref");
    out.push(`  worktrees removed: ${removed.length}`);
    for (const step of removed) out.push(`    ${step.entry.path}`);
    out.push(`  branches deleted: ${refs.length}`);
    for (const step of refs) out.push(`    ${step.label.replace(/^delete branch /, "")}`);
    out.push(`  worktrees kept: ${rows.length - removed.length}`);
    if (scans) {
      out.push(`  Process scan: ${describeProcessScan(scans.processes)}`);
      out.push(`  Claude sessions: ${describeClaudeScan(scans.claude)}`);
    }
    if (applied.failed) {
      out.push(`  FAILED at: ${applied.failed.step.label}`);
      out.push(`    ${applied.failed.error}`);
      out.push(`  not attempted: ${applied.skipped.length} step(s)`);
    }
  }
  return `${out.join("\n")}\n`;
}

// --- IO ---------------------------------------------------------------------

function run(argv, cwd) {
  return execFileSync(argv[0], argv.slice(1), { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function scanProcesses() {
  if (existsSync("/proc/self/cwd")) {
    const found = [];
    for (const pid of readdirSync("/proc").filter((name) => /^\d+$/.test(name))) {
      try {
        found.push({ pid: Number(pid), command: readFileSync(`/proc/${pid}/comm`, "utf8").trim(), cwd: readlinkSync(`/proc/${pid}/cwd`) });
      } catch {
        // The process ended or belongs to another user.
      }
    }
    return found;
  }
  const result = spawnSync("lsof", ["-a", "-d", "cwd", "-Fpcn"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.error || !result.stdout) return null;
  const found = [];
  let current = null;
  for (const line of result.stdout.split("\n")) {
    if (line.startsWith("p")) current = { pid: Number(line.slice(1)), command: "", cwd: "" };
    else if (line.startsWith("c") && current) current.command = line.slice(1);
    else if (line.startsWith("n") && current) found.push({ ...current, cwd: line.slice(1) });
  }
  return found;
}

// Live Claude sessions, interactive and background, with the directory each one
// works in. A missing `claude` binary is reported as "missing", never as an
// empty list, so the report cannot claim the scan ran. A binary that fails or
// prints something unreadable is unknown (null).
export function scanClaudeSessions(spawn = spawnSync) {
  const result = spawn("claude", ["agents", "--json"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 60_000 });
  if (result.error?.code === "ENOENT") return { status: "missing", sessions: [], withoutCwd: 0 };
  if (result.error || result.status !== 0 || !result.stdout) return null;
  const parsed = parseClaudeSessions(result.stdout);
  return parsed && { status: "ok", ...parsed };
}

// Untracked files count whatever the user's status.showUntrackedFiles says.
function changedPaths(path) {
  return run(["git", "--no-optional-locks", "status", "--porcelain", "--untracked-files=all"], path)
    .split("\n")
    .filter(Boolean);
}

function makeAncestry(mainPath, oids) {
  const unique = [...new Set(oids)];
  let present = new Set();
  try {
    const out = execFileSync("git", ["cat-file", "--batch-check=%(objectname) %(objecttype)"], {
      cwd: mainPath,
      encoding: "utf8",
      input: unique.join("\n") + "\n",
      stdio: ["pipe", "pipe", "pipe"],
    });
    present = new Set(out.split("\n").filter((line) => line.endsWith(" commit")).map((line) => line.split(" ")[0]));
  } catch {
    // Without object lookups every ancestry answer stays unknown.
  }
  const cache = new Map();
  return (ancestor, descendant) => {
    if (!present.has(descendant) && ancestor !== descendant) return null;
    const key = `${ancestor}..${descendant}`;
    if (cache.has(key)) return cache.get(key);
    let answer;
    try {
      run(["git", "merge-base", "--is-ancestor", ancestor, descendant], mainPath);
      answer = true;
    } catch (error) {
      answer = error.status === 1 ? false : null;
    }
    cache.set(key, answer);
    return answer;
  };
}

// `gh pr list` stops silently at --limit. When a result fills the limit, ask
// again with a larger one; a result that fills the largest limit is reported as
// possibly truncated.
const PR_LIMITS = [1000, 5000, 20000];

export function loadPrs(prsFile, cwd, runCommand = run) {
  if (prsFile) return { prs: JSON.parse(readFileSync(prsFile, "utf8")), truncated: false };
  let prs = [];
  for (const limit of PR_LIMITS) {
    const out = runCommand(
      ["gh", "pr", "list", "--state", "all", "--limit", String(limit), "--json", "number,state,headRefName,headRefOid,baseRefName,url"],
      cwd,
    );
    prs = JSON.parse(out);
    if (prs.length < limit) return { prs, truncated: false };
  }
  return { prs, truncated: true };
}

function loadRailway(mainPath, prs) {
  try {
    const out = run(["railway", "environment", "list", "--json"], mainPath);
    return findStaleRailwayEnvironments({ environments: JSON.parse(out).environments ?? [], prs });
  } catch (error) {
    return { error: String(error.stderr || error.message).trim().split("\n")[0] };
  }
}

function parseArgs(argv) {
  const options = { apply: false, json: false, size: true, railway: true, prsFile: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") continue;
    else if (arg === "--apply") options.apply = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--no-size") options.size = false;
    else if (arg === "--no-railway") options.railway = false;
    else if (arg === "--prs-file") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) throw new Error("--prs-file needs a path to a JSON file");
      options.prsFile = value;
      i += 1;
    }
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

// `io` lets tests inject the environment, the process and Claude scans, the
// command runner used by --apply, and the output streams.
export function main(argv = process.argv.slice(2), cwd = process.cwd(), io = {}) {
  const env = io.env ?? process.env;
  const out = io.stdout ?? ((text) => process.stdout.write(text));
  const err = io.stderr ?? ((text) => process.stderr.write(`${text}\n`));
  const exec = io.exec ?? run;
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    err(`${error.message}\nUsage: worktree-gc [--apply] [--json] [--no-size] [--no-railway] [--prs-file <json>]`);
    return 2;
  }

  // Hand-written PR data must never drive removals. The test suite sets the
  // variable; nothing else should.
  if (options.apply && options.prsFile && env.WORKTREE_GC_ALLOW_PRS_FILE_APPLY !== "1") {
    err("--prs-file cannot be combined with --apply: removals must follow live PR data from gh.");
    return 2;
  }

  // Compare real paths on both sides: `lsof`, Claude sessions and git's own
  // listing can each spell the same directory differently.
  const entries = parseWorktreePorcelain(run(["git", "worktree", "list", "--porcelain"], cwd)).map((entry) => ({
    ...entry,
    listedPath: entry.path,
    path: realpathOrSelf(entry.path),
  }));
  const mainPath = entries[0].path;
  const currentPath = realpathOrSelf(run(["git", "rev-parse", "--show-toplevel"], cwd).trim());
  let prs;
  let prsTruncated;
  try {
    ({ prs, truncated: prsTruncated } = (io.loadPrs ?? loadPrs)(options.prsFile, mainPath));
  } catch (error) {
    err(`Cannot evaluate the gate without PR data: ${String(error.stderr || error.message).trim()}`);
    return 1;
  }
  if (prsTruncated) {
    if (options.apply) {
      err("The PR list may be truncated (gh returned its full limit), so --apply refuses to remove anything.");
      return 1;
    }
    err("Warning: the PR list may be truncated (gh returned its full limit); a worktree's PR may be missing from this report.");
  }
  const pid = io.pid ?? process.pid;
  const scannedProcesses = (io.scanProcesses ?? scanProcesses)();
  if (scannedProcesses === null) {
    if (options.apply) {
      err("Cannot scan running processes, so --apply refuses to remove anything.");
      return 1;
    }
    err("Warning: could not scan running processes; running agents are not detected.");
  }
  // A scan that cannot see this very process is partial (a sandbox can hide
  // processes from `lsof`), so what it did not list proves nothing.
  const includesCurrentProcess = Boolean(scannedProcesses?.some((proc) => proc.pid === pid));
  if (scannedProcesses && !includesCurrentProcess) {
    if (options.apply) {
      err(`The process scan did not include this process (pid ${pid}), so it may be partial; --apply refuses to remove anything.`);
      return 1;
    }
    err(`Warning: the process scan did not include this process (pid ${pid}), so it may be partial; running agents may not be detected.`);
  }
  const activeProcesses = scannedProcesses && scannedProcesses.map((proc) => ({ ...proc, cwd: realpathOrSelf(proc.cwd) }));
  const claudeScan = (io.scanClaudeSessions ?? scanClaudeSessions)();
  if (claudeScan === null) {
    if (options.apply) {
      err("Cannot read Claude sessions (`claude agents --json`), so --apply refuses to remove anything.");
      return 1;
    }
    err("Warning: could not read Claude sessions; agents running in unlocked worktrees are not detected.");
  } else if (claudeScan.status === "missing") {
    err("Warning: `claude` was not found on PATH, so Claude sessions were not checked; agents running in unlocked worktrees are not detected.");
  } else if (claudeScan.withoutCwd > 0) {
    const n = claudeScan.withoutCwd;
    err(`Warning: ${n} Claude ${n === 1 ? "session has" : "sessions have"} no working directory, so ${n === 1 ? "it" : "they"} cannot be matched to a worktree.`);
  }
  const claudeSessions = claudeScan && claudeScan.sessions.map((session) => ({ ...session, cwd: realpathOrSelf(session.cwd) }));
  const scans = {
    processes: {
      status: scannedProcesses === null ? "unavailable" : includesCurrentProcess ? "includes-current-process" : "excludes-current-process",
      count: scannedProcesses?.length ?? 0,
      includesCurrentProcess,
    },
    claude: {
      status: claudeScan === null ? "unreadable" : claudeScan.status,
      sessions: claudeScan?.sessions.length ?? 0,
      withoutCwd: claudeScan?.withoutCwd ?? 0,
    },
  };

  let mainSha = null;
  for (const ref of ["origin/main", "main"]) {
    try {
      mainSha = run(["git", "rev-parse", "--verify", "--quiet", ref], mainPath).trim();
      break;
    } catch {
      // Try the next ref.
    }
  }
  const heads = entries.map((entry) => entry.head).filter((head) => head && !ZERO_SHA.test(head));
  const branches = run(["git", "for-each-ref", "--format=%(refname:short)%09%(objectname)", "refs/heads/"], mainPath)
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [name, sha] = line.split("\t");
      return { name, sha };
    });
  const isAncestor = makeAncestry(mainPath, [
    ...prs.map((pr) => pr.headRefOid),
    ...heads,
    ...branches.map((branch) => branch.sha),
    ...(mainSha ? [mainSha] : []),
  ]);

  const rows = entries.map((entry) => {
    let dirtyCount = null;
    if (!entry.prunable && existsSync(entry.path)) {
      try {
        dirtyCount = changedPaths(entry.path).length;
      } catch {
        dirtyCount = null;
      }
    }
    const onMain = Boolean(mainSha) && Boolean(entry.head) && !ZERO_SHA.test(entry.head) && isAncestor(entry.head, mainSha) === true;
    const verdict = classifyWorktree(entry, {
      mainPath,
      currentPath,
      dirtyCount,
      activeProcesses: [...(activeProcesses ?? []), ...(claudeSessions ?? [])],
      onMain,
      prs,
      isAncestor,
    });
    let size = "n/a";
    if (options.size && existsSync(entry.path)) {
      try {
        size = humanSize(Number(run(["du", "-sk", entry.path], cwd).split("\t")[0]));
      } catch {
        size = "n/a";
      }
    }
    return { entry, size, dirtyCount, verdict };
  });

  const staleBranches = findStaleBranches({ branches, worktrees: entries, prs, isAncestor, mainSha });
  const railway = options.railway ? loadRailway(mainPath, prs) : null;

  let applied = null;
  if (options.apply) {
    const steps = planApply({ rows, staleBranches });
    for (const step of steps) {
      if (step.kind !== "worktree") continue;
      // Recheck just before removal. Git refuses a locked tree and, by default,
      // a dirty one, but not untracked files under status.showUntrackedFiles=no,
      // so this recheck (HEAD unchanged, nothing changed or untracked) is the guard.
      step.verify = () => {
        const head = run(["git", "rev-parse", "HEAD"], step.entry.path).trim();
        if (head !== step.entry.head) throw new Error(`HEAD moved from ${step.entry.head} to ${head}`);
        if (changedPaths(step.entry.path).length) throw new Error("worktree is no longer clean");
      };
    }
    applied = runApply(steps, (argv) => exec(argv, mainPath));
  }

  if (options.json) {
    const view = rows.map(({ entry, size, dirtyCount, verdict }) => ({
      path: entry.path,
      head: entry.head,
      branch: entry.branch,
      size,
      locked: entry.locked,
      lockReason: entry.lockReason,
      changed: dirtyCount,
      pr: verdict.pr ? { number: verdict.pr.number, state: verdict.pr.state } : null,
      verdict: verdict.verdict,
      reason: verdict.reason,
    }));
    const doneSteps = applied && { done: applied.done.map((s) => s.label), failed: applied.failed && { step: applied.failed.step.label, error: applied.failed.error }, skipped: applied.skipped.map((s) => s.label) };
    out(`${JSON.stringify({ mode: options.apply ? "apply" : "read-only", worktrees: view, staleBranches, railway, scans, applied: doneSteps }, null, 2)}\n`);
  } else {
    out(formatReport({ rows, staleBranches, railway, applied, scans }));
  }
  return applied?.failed ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main();
}
