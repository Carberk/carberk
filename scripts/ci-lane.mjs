#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function isDocsPath(path) {
  return path.startsWith("docs/") || path.endsWith(".md");
}

export function laneFor(paths) {
  return paths.length > 0 && paths.every(isDocsPath) ? "docs" : "full";
}

export function changedPaths(base, cwd) {
  const output = execFileSync("git", ["diff", "--name-only", "--no-renames", "-z", base, "HEAD"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return output.split("\0").filter(Boolean);
}

export function chooseLane(base, cwd) {
  if (!base || /^0+$/.test(base)) {
    return { lane: "full", reason: "no base commit" };
  }
  try {
    const paths = changedPaths(base, cwd);
    return { lane: laneFor(paths), paths };
  } catch (error) {
    return { lane: "full", reason: `could not list changed files: ${error.message.split("\n")[0]}` };
  }
}

const isSha = (value) => typeof value === "string" && /^[0-9a-f]{40}$/.test(value) && !/^0+$/.test(value);

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "pipe"] }).replace(/\n$/, "");
}

function parents(commit, cwd) {
  return git(["cat-file", "-p", commit], cwd).split("\n\n", 1)[0].split("\n")
    .filter(line => line.startsWith("parent ")).map(line => line.slice(7));
}

function diffPaths(from, to, cwd) {
  return git(["diff", "--name-only", "--no-renames", "-z", from, to], cwd).split("\0").filter(Boolean);
}

function ancestor(from, to, cwd) {
  git(["merge-base", "--is-ancestor", from, to], cwd);
}

function automaticMerge(first, second, cwd) {
  const bases = git(["merge-base", "--all", first, second], cwd).split("\n");
  if (!bases.every(isSha)) throw new Error("missing merge base");
  const remaining = git(["rev-list", first, second, "--not", ...bases], cwd).split("\n").filter(Boolean);
  for (const commit of remaining) {
    const visible = git(["rev-list", "--parents", "-n", "1", commit], cwd).split(" ").slice(1);
    if (visible.length !== parents(commit, cwd).length) throw new Error("shallow merge history");
  }
  const result = spawnSync("git", ["merge-tree", "--write-tree", "--name-only", "-z", first, second], {
    cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error || ![0, 1].includes(result.status)) throw new Error("could not reconstruct automatic merge");
  const fields = result.stdout.split("\0");
  const tree = fields.shift();
  if (!isSha(tree)) throw new Error("unreadable automatic merge tree");
  const conflicts = [];
  if (result.status === 1) {
    const end = fields.indexOf("");
    if (end < 0) throw new Error("unreadable merge conflicts");
    conflicts.push(...fields.slice(0, end));
    if (!conflicts.length) throw new Error("ambiguous merge conflicts");
  }
  return { tree, conflicts };
}

function handChangedPaths(before, head, main, cwd) {
  ancestor(before, head, cwd);
  const paths = new Set();
  let commit = head;
  for (let count = 0; commit !== before; count++) {
    if (count >= 10000) throw new Error("too many commits since previous head");
    const ps = parents(commit, cwd);
    if (ps.length === 1) {
      for (const path of diffPaths(ps[0], commit, cwd)) paths.add(path);
    } else if (ps.length === 2) {
      ancestor(ps[1], main, cwd);
      const { tree, conflicts } = automaticMerge(ps[0], ps[1], cwd);
      for (const path of [...conflicts, ...diffPaths(tree, commit, cwd)]) paths.add(path);
    } else {
      throw new Error("root or octopus merge since previous head");
    }
    if ([...paths].some(path => !isDocsPath(path))) return [...paths];
    commit = ps[0];
  }
  return [...paths];
}

export async function readPreviousChecks(repository, sha, token = process.env.GITHUB_TOKEN) {
  if (!token) throw new Error("missing workflow token");
  const url = `https://api.github.com/repos/${repository}/commits/${sha}/check-runs?check_name=pr&filter=latest&per_page=100`;
  const response = await fetch(url, {
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" },
    signal: AbortSignal.timeout(10000), redirect: "error",
  });
  if (!response.ok) throw new Error(`previous check API returned ${response.status}`);
  return response.json();
}

function previousIsGreen(data, before, number) {
  if (data?.total_count !== 1 || !Array.isArray(data.check_runs) || data.check_runs.length !== 1) return false;
  const check = data.check_runs[0];
  return check?.name === "pr" && check.head_sha === before && check.status === "completed"
    && check.conclusion === "success" && check.app?.slug === "github-actions"
    && Array.isArray(check.pull_requests) && check.pull_requests.some(pr => pr.number === number);
}

export async function chooseLaneForEvent(base, cwd, {
  eventName, event, readCheckRuns = readPreviousChecks, fetchHistory = false,
} = {}) {
  const existing = chooseLane(base, cwd);
  if (existing.lane === "docs") return existing;
  if (!existing.paths) return existing;
  try {
    const pr = event?.pull_request;
    const repository = event?.repository?.full_name;
    if (eventName !== "pull_request" || event?.action !== "synchronize"
      || !isSha(event.before) || !isSha(event.after) || event.before === event.after
      || !isSha(pr?.head?.sha) || event.after !== pr.head.sha || !isSha(pr?.base?.sha)
      || !Number.isSafeInteger(event.number) || event.number <= 0 || pr.number !== event.number
      || typeof repository !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(repository)
      || pr.base.ref !== "main" || pr.base.repo?.full_name !== repository
      || pr.head.repo?.full_name !== repository) {
      throw new Error("missing or unsupported synchronize input");
    }
    const ps = parents("HEAD", cwd);
    if (ps.length !== 2 || !isSha(ps[0]) || ps[1] !== pr.head.sha
      || git(["rev-parse", base], cwd) !== ps[0]) throw new Error("checkout does not match event merge parents");
    let paths;
    for (let attempt = 0; ; attempt++) {
      try {
        ancestor(pr.base.sha, ps[0], cwd);
        paths = handChangedPaths(event.before, pr.head.sha, ps[0], cwd);
        break;
      } catch (error) {
        if (!fetchHistory || attempt >= 8 || git(["rev-parse", "--is-shallow-repository"], cwd) !== "true") throw error;
        git(["fetch", "--no-tags", `--deepen=${2 ** attempt}`, "origin", pr.head.sha, event.before, ps[0], pr.base.sha], cwd);
      }
    }
    if (paths.some(path => !isDocsPath(path))) return { lane: "full", paths, reason: "non-docs path changed by hand since previous head" };
    const checks = await readCheckRuns(repository, event.before);
    if (!previousIsGreen(checks, event.before, event.number)) throw new Error("previous head has no unambiguous successful pr check for this pull request");
    return { lane: "docs", paths, reason: "green previous head; only documentation changed by hand since then" };
  } catch (error) {
    return { ...existing, reason: `could not prove docs since previous head: ${error.message.split("\n")[0]}` };
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let event;
  try {
    if (process.env.GITHUB_EVENT_PATH) event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  } catch { }
  const { lane, paths, reason } = await chooseLaneForEvent(process.argv[2], undefined, {
    eventName: process.env.GITHUB_EVENT_NAME, event, fetchHistory: true,
  });
  if (reason) console.log(`${paths === undefined ? "::warning::" : ""}${reason}`);
  if (paths) console.log(`Changed files:\n${paths.join("\n")}`);
  console.log(`CI lane: ${lane}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `lane=${lane}\n`);
}
