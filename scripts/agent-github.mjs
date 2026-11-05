import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const READ_ATTEMPTS = 3;
const READ_RETRY_BASE_MS = 200;

const help = `Compact GitHub operations (JSON output; writes require --apply):
  pnpm agent:github issue N | pr N | execution N
  pnpm agent:github queue [--limit 20]
  pnpm agent:github comments issue|pr N [--limit 3] [--before CURSOR]
  pnpm agent:github reviews pr N [--limit 3] [--before CURSOR]
  pnpm agent:github review-threads pr N [--limit 3] [--after CURSOR]
  pnpm agent:github thread-comments THREAD_ID [--limit 3] [--after CURSOR]
  pnpm agent:github create-issue --title TEXT --body-file FILE [--label NAME] [--apply]
  pnpm agent:github comment issue|pr N --body-file FILE [--apply]
Reads accept --max-chars 1800 and --full for complete bodies.
All commands accept --repo [HOST/]OWNER/REPO. Comments are issue comments,
not formal PR reviews. Queue output is a bounded snapshot, not a merge verdict.`;

function bounded(text = "", limit) {
  return { text: text.slice(0, limit), truncated: text.length > limit };
}

function sections(body = "", pattern) {
  const result = [];
  let current;
  let fence;
  for (const line of body.split(/\r?\n/)) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
    } else if (marker) {
      fence = marker[1];
    } else {
      const heading = line.match(/^#{1,2}\s+(.+?)\s*#*$/);
      if (heading) {
        current = pattern.test(heading[1]) ? { heading: heading[1], lines: [] } : undefined;
        if (current) result.push(current);
        continue;
      }
    }
    if (current) current.lines.push(line);
  }
  return result.map(({ heading, lines }) => ({ heading, text: lines.join("\n").trim() }));
}

export function executionSections(body) {
  return sections(body, /^Execution state(?:\s|$)/i);
}

function integer(value, maximum, label) {
  if (!/^[1-9]\d*$/.test(value ?? "") || Number(value) > maximum) throw new Error(`Invalid ${label}`);
  return Number(value);
}

export function parseCommand(args) {
  const [command, ...rest] = args;
  if (!command || command === "--help" || command === "help") return { command: "help" };
  const config = { command, limit: ["comments", "reviews", "review-threads", "thread-comments"].includes(command) ? 3 : 20, maxChars: 1800, labels: [], apply: false, full: false };
  const writes = ["create-issue", "comment"].includes(command);
  if (!["issue", "pr", "execution", "queue", "comments", "reviews", "review-threads", "thread-comments", "create-issue", "comment"].includes(command)) throw new Error("Unknown command; use --help");
  if (["comments", "reviews", "review-threads", "comment"].includes(command)) {
    config.kind = rest.shift();
    if (command === "comments" || command === "comment") {
      if (!["issue", "pr"].includes(config.kind)) throw new Error("Choose issue or pr");
    } else if (config.kind !== "pr") throw new Error(`${command} requires a PR`);
  }
  if (command === "thread-comments") {
    config.threadId = rest.shift();
    if (!config.threadId || config.threadId.startsWith("--")) throw new Error("thread-comments requires a thread ID");
  } else if (!["queue", "create-issue"].includes(command)) config.number = integer(rest.shift(), 2147483647, "issue/PR number");
  const allowed = new Set(["--repo"]);
  if (writes) { allowed.add("--body-file"); allowed.add("--apply"); }
  else { allowed.add("--max-chars"); allowed.add("--full"); }
  if (["queue", "comments", "reviews", "review-threads", "thread-comments"].includes(command)) allowed.add("--limit");
  if (["comments", "reviews"].includes(command)) allowed.add("--before");
  if (["review-threads", "thread-comments"].includes(command)) allowed.add("--after");
  if (command === "create-issue") { allowed.add("--title"); allowed.add("--label"); }
  while (rest.length) {
    const flag = rest.shift();
    if (!allowed.has(flag)) throw new Error(`Unsupported flag: ${flag}`);
    if (flag === "--apply") { config.apply = true; continue; }
    if (flag === "--full") { config.full = true; continue; }
    const value = rest.shift();
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    if (flag === "--limit") config.limit = integer(value, 100, "limit (1..100)");
    if (flag === "--max-chars") config.maxChars = integer(value, 20000, "character limit (1..20000)");
    if (flag === "--repo") config.repo = value;
    if (flag === "--before" || flag === "--after") config.cursor = value;
    if (flag === "--title") config.title = value.trim();
    if (flag === "--label") config.labels.push(value);
    if (flag === "--body-file") config.bodyFile = resolve(value);
  }
  if (writes && !config.bodyFile) throw new Error("Writes require --body-file");
  if (command === "create-issue" && !config.title) throw new Error("Issue creation requires --title");
  return config;
}

export function compactItem(item, kind, maxChars = 1800) {
  const result = {
    number: item.number, title: item.title, state: item.state, url: item.url,
    labels: item.labels?.map((label) => label.name),
  };
  const compactSections = (values) => values.map(({ heading, text }) => ({ heading, ...bounded(text, maxChars) }));
  if (kind === "issue") {
    result.parent = compactSections(sections(item.body, /^Parent\b/i));
    result.whatToBuild = compactSections(sections(item.body, /^What to build\b/i));
    result.acceptance = compactSections(sections(item.body, /^Acceptance criteria\b/i));
    result.dependencies = compactSections(sections(item.body, /^(?:Depends on|Blocked by)\b/i));
    result.bodyPreview = bounded(item.body, maxChars);
  } else {
    Object.assign(result, {
      branch: item.headRefName, head: item.headRefOid, draft: item.isDraft,
      autoMerge: Boolean(item.autoMergeRequest), execution: compactSections(executionSections(item.body)),
      checks: (item.statusCheckRollup ?? []).map((check) => ({
        name: check.name ?? check.context,
        state: check.conclusion || check.status || check.state || "UNKNOWN",
      })),
    });
  }
  return result;
}

function execute(program, args) {
  const result = spawnSync(program, args, {
    encoding: "utf8", timeout: 60000, maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1" },
  });
  if (result.error || result.status !== 0) throw new Error(`${program} failed: ${result.error?.message ?? result.stderr.trim().slice(0, 1200)}`);
  return result.stdout;
}

export function isTransientGithubError(error) {
  const text = `${error?.code ?? ""} ${error?.status ?? ""} ${error?.message ?? error ?? ""}`;
  if ([429, 500, 502, 503, 504].includes(Number(error?.status))) return true;
  const status = /(?:^|\b)(?:gh:\s*)?(?:HTTP(?:\/\d+(?:\.\d+)?)?\s*(?:error\s*)?|status(?:\s+code)?\s*[:=]?\s*|(?:returned|response)\s+)(429|500|502|503|504)\b/i;
  const transport = /(?:ECONNRESET|ECONNREFUSED|ETIMEDOUT|failed to connect|could not resolve host|connection reset by peer|connection refused|network is unreachable|timed out|timeout|temporarily unavailable|service unavailable)/i;
  return status.test(text) || transport.test(text);
}

function sleepSync(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function readGithub(gh, args, sleep = sleepSync) {
  for (let attempt = 1; ; attempt += 1) {
    try { return gh(args); }
    catch (error) {
      if (attempt >= READ_ATTEMPTS || !isTransientGithubError(error)) throw error;
      sleep(READ_RETRY_BASE_MS * 2 ** (attempt - 1));
    }
  }
}

function writeResource(url) {
  const match = String(url).match(/\/issues\/(\d+)(?:#issuecomment-(\d+))?\/?$/);
  if (!match) return undefined;
  return { issueNumber: Number(match[1]), commentId: match[2] ? Number(match[2]) : undefined };
}

function verifyWrite({ command, url, body, title, repo, gh, sleep }) {
  const resource = writeResource(url);
  if (!resource) throw new Error("GitHub returned an unrecognizable resource URL");
  if (command === "create-issue") {
    const item = JSON.parse(readGithub(gh, ["issue", "view", String(resource.issueNumber), "--repo", repo.name, "--json", "number,title,state,url"], sleep));
    if (item.number !== resource.issueNumber || item.title !== title || item.state !== "OPEN") throw new Error("created issue read-back did not match");
    return { status: "verified", resource: { number: item.number, title: item.title, state: item.state, url: item.url } };
  }
  const item = JSON.parse(readGithub(gh, ["api", `repos/${repo.owner}/${repo.repo}/issues/comments/${resource.commentId}`], sleep));
  if (item.id !== resource.commentId || item.body !== body) throw new Error("created comment read-back did not match");
  return { status: "verified", resource: { id: item.id, url: item.html_url ?? url } };
}

function applyWrite({ command, args, body, title, repo, gh, sleep }) {
  let url;
  try { url = gh(args).trim(); }
  catch (error) { return { applied: false, uncertain: true, error: error.message }; }
  try {
    return { applied: true, url, verification: verifyWrite({ command, url, body, title, repo, gh, sleep }) };
  } catch (error) {
    return { applied: true, url, verification: { status: "uncertain", reason: error.message } };
  }
}

function repository(explicit, gh, sleep) {
  const value = explicit ?? readGithub(gh, ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"], sleep).trim();
  const parts = value.split("/");
  if (![2, 3].includes(parts.length) || parts.some((part) => !/^[\w.-]+$/.test(part))) throw new Error("Invalid repository; use [HOST/]OWNER/REPO");
  return { name: value, host: parts.length === 3 ? parts[0] : "github.com", owner: parts.at(-2), repo: parts.at(-1) };
}

export function runCommand(config, dependencies = {}) {
  if (config.command === "help") return { help };
  const gh = dependencies.gh ?? ((args) => execute("gh", args));
  const sleep = dependencies.sleep ?? sleepSync;
  const repo = repository(config.repo ?? dependencies.repo, gh, sleep);
  const limit = config.full ? Number.MAX_SAFE_INTEGER : config.maxChars;
  if (["comment", "create-issue"].includes(config.command)) {
    const body = readFileSync(config.bodyFile, "utf8");
    if (!body.trim()) throw new Error("Body file is empty");
    const args = config.command === "comment"
      ? [config.kind, "comment", String(config.number)]
      : ["issue", "create", "--title", config.title, ...config.labels.flatMap((label) => ["--label", label])];
    args.push("--repo", repo.name, "--body-file", config.bodyFile);
    if (!config.apply) return { dryRun: true, args, bodyCharacters: body.length };
    return applyWrite({ command: config.command, args, body, title: config.title, repo, gh, sleep });
  }
  if (["comments", "reviews", "review-threads", "thread-comments"].includes(config.command)) {
    const field = config.kind === "pr" ? "pullRequest" : "issue";
    const connection = config.command === "comments"
      ? `comments(last: $limit, before: $cursor) { totalCount pageInfo { hasPreviousPage startCursor } nodes { url createdAt author { login } body } }`
      : config.command === "reviews"
        ? `reviews(last: $limit, before: $cursor) { totalCount pageInfo { hasPreviousPage startCursor } nodes { url submittedAt author { login } state body commit { oid } } }`
        : `reviewThreads(first: $limit, after: $cursor) { totalCount pageInfo { hasNextPage endCursor } nodes { id isResolved isOutdated path line originalLine diffSide comments(first: 10) { totalCount pageInfo { hasNextPage endCursor } nodes { url createdAt author { login } body } } } }`;
    const query = config.command === "thread-comments"
      ? `query($id:ID!,$limit:Int!,$cursor:String) { node(id:$id) { ... on PullRequestReviewThread { comments(first:$limit,after:$cursor) { totalCount pageInfo { hasNextPage endCursor } nodes { url createdAt author { login } body } } } } }`
      : `query($owner:String!,$repo:String!,$number:Int!,$limit:Int!,$cursor:String) { repository(owner:$owner,name:$repo) { ${field}(number:$number) { ${connection} } } }`;
    const args = ["api", "graphql", "--hostname", repo.host, "-f", `query=${query}`, "-F", `limit=${config.limit}`];
    if (config.command === "thread-comments") args.push("-f", `id=${config.threadId}`);
    else args.push("-f", `owner=${repo.owner}`, "-f", `repo=${repo.repo}`, "-F", `number=${config.number}`);
    if (config.cursor) args.push("-f", `cursor=${config.cursor}`);
    const data = JSON.parse(readGithub(gh, args, sleep));
    if (data.errors?.length) throw new Error("GitHub GraphQL returned errors");
    const item = data.data?.repository?.[field];
    const result = config.command === "thread-comments" ? data.data?.node?.comments : item?.[config.command === "comments" ? "comments" : config.command === "reviews" ? "reviews" : "reviewThreads"];
    if (!result) throw new Error(`GitHub returned no ${config.command} connection`);
    const boundedBody = ({ body, ...value }) => ({ ...value, body: body.slice(0, limit), truncated: body.length > limit });
    if (config.command === "thread-comments") return { threadId: config.threadId, surface: "thread-comments", totalComments: result.totalCount, omittedComments: result.totalCount - result.nodes.length, pageInfo: result.pageInfo, comments: result.nodes.map(boundedBody), omitted: ["other threads", "ordinary comments", "formal reviews"] };
    if (config.command === "comments") return { number: config.number, surface: "comments", totalComments: result.totalCount, omittedComments: result.totalCount - result.nodes.length, pageInfo: result.pageInfo, comments: result.nodes.map(boundedBody), omitted: config.kind === "pr" ? ["formal reviews", "inline review threads"] : [] };
    if (config.command === "reviews") return { number: config.number, surface: "reviews", totalReviews: result.totalCount, omittedReviews: result.totalCount - result.nodes.length, pageInfo: result.pageInfo, reviews: result.nodes.map(boundedBody), omitted: ["ordinary comments", "inline review threads"] };
    return { number: config.number, surface: "review-threads", totalThreads: result.totalCount, omittedThreads: result.totalCount - result.nodes.length, pageInfo: result.pageInfo, threads: result.nodes.map((thread) => ({ ...thread, comments: { ...thread.comments, omittedComments: thread.comments.totalCount - thread.comments.nodes.length, nodes: thread.comments.nodes.map(boundedBody) } })), omitted: ["ordinary comments", "formal reviews"] };
  }
  const issueFields = "number,title,state,url,labels,body";
  const prFields = "number,title,state,url,headRefName,headRefOid,isDraft,autoMergeRequest,statusCheckRollup,body";
  if (config.command === "queue") {
    const items = JSON.parse(readGithub(gh, ["pr", "list", "--repo", repo.name, "--state", "open", "--limit", String(config.limit), "--json", prFields], sleep));
    return { snapshot: true, limit: config.limit, possiblyMore: items.length === config.limit, omitted: ["full bodies", "comments", "formal reviews", "inline review threads"], prs: items.map((item) => compactItem(item, "pr", limit)) };
  }
  const kind = config.command === "issue" ? "issue" : "pr";
  const item = JSON.parse(readGithub(gh, [kind, "view", String(config.number), "--repo", repo.name, "--json", kind === "issue" ? issueFields : prFields], sleep));
  if (config.command === "execution") return { number: item.number, head: item.headRefOid, execution: compactItem(item, "pr", limit).execution };
  const compact = compactItem(item, kind, limit);
  const omitted = [
    ...(!config.full && (kind === "pr" || compact.bodyPreview?.truncated) ? ["full body"] : []),
    "comments",
    ...(kind === "pr" ? ["formal reviews", "inline review threads"] : ["native parent", "native blocking links"]),
  ];
  if (config.full) delete compact.bodyPreview;
  return { ...compact, ...(config.full ? { body: item.body } : {}), omitted };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = runCommand(parseCommand(process.argv.slice(2)));
    console.log(JSON.stringify(result));
    if (result.uncertain || result.verification?.status === "uncertain") process.exitCode = 2;
  }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
