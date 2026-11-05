import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { compactItem, executionSections, isTransientGithubError, parseCommand, runCommand } from "./agent-github.mjs";

test("reads every grouped Execution state and ignores headings inside fences", () => {
  const body = "## Summary\nhello\n## Execution state for #1\n- **Status:** verifying\n```md\n## Evidence\n```\n- **Next action:** tests\n## Evidence\npass\n## Execution state for #2\n- **Status:** implementing\n";
  assert.deepEqual(executionSections(body), [
    { heading: "Execution state for #1", text: "- **Status:** verifying\n```md\n## Evidence\n```\n- **Next action:** tests" },
    { heading: "Execution state for #2", text: "- **Status:** implementing" },
  ]);
});

test("compact PR omits unrelated body and exposes truncation and actual check state", () => {
  const item = compactItem({ number: 42, title: "Example", body: "x".repeat(60000), headRefOid: "abc", statusCheckRollup: [{ name: "pr", status: "COMPLETED", conclusion: "FAILURE" }] }, "pr", 200);
  assert.equal(item.body, undefined);
  assert.deepEqual(item.checks, [{ name: "pr", state: "FAILURE" }]);
  assert.equal(item.head, "abc");
  const issue = compactItem({ body: "## Acceptance criteria\n- [ ] " + "x".repeat(1000) }, "issue", 200);
  assert.equal(issue.acceptance[0].text.length, 200);
  assert.equal(issue.acceptance[0].truncated, true);
});

test("rejects unsafe numbers, unknown flags and excessive comment history before invoking gh", () => {
  for (const args of [["issue", "-1"], ["pr", "12;echo"], ["issue", "2", "--surprise"], ["comments", "issue", "2", "--limit", "101"], ["queue", "--apply"]]) {
    assert.throws(() => parseCommand(args));
  }
});

test("bounded comments request only the last requested nodes and report missing history", () => {
  const calls = [];
  const result = runCommand(parseCommand(["comments", "pr", "42", "--limit", "2", "--max-chars", "200"]), {
    repo: "owner/repo", gh(args) { calls.push(args); return JSON.stringify({ data: { repository: { pullRequest: { comments: { totalCount: 15, nodes: [{ body: "x".repeat(500), url: "https://example.test/c" }], pageInfo: { hasPreviousPage: true } } } } } }); },
  });
  assert.match(calls[0].join(" "), /comments\(last: \$limit, before: \$cursor\)/);
  assert.ok(calls[0].includes("limit=2"));
  assert.equal(result.omittedComments, 14);
  assert.equal(result.comments[0].body.length, 200);
  assert.equal(result.comments[0].truncated, true);
});

test("comments are dry-run by default; apply preserves body-file text and avoids a shell", () => {
  const root = mkdtempSync(join(tmpdir(), "autotm-gh-"));
  const path = join(root, "body with spaces.md");
  const body = 'Line one\n\nLiteral $(touch /tmp/no) and `backticks`.\n';
  writeFileSync(path, body);
  const calls = [];
  const deps = { repo: "owner/repo", gh(args) {
    calls.push(args);
    if (args[0] === "api") return JSON.stringify({ id: 123, body, html_url: "https://github.com/owner/repo/issues/42#issuecomment-123" });
    assert.equal(readFileSync(args[args.indexOf("--body-file") + 1], "utf8"), body);
    return "https://github.com/owner/repo/issues/42#issuecomment-123\n";
  } };
  try {
    const dry = runCommand(parseCommand(["comment", "issue", "42", "--body-file", path]), deps);
    assert.equal(dry.dryRun, true);
    assert.equal(calls.length, 0);
    const applied = runCommand(parseCommand(["comment", "issue", "42", "--body-file", path, "--apply"]), deps);
    assert.equal(applied.url, "https://github.com/owner/repo/issues/42#issuecomment-123");
    assert.equal(applied.verification.status, "verified");
    assert.equal(calls.length, 2);
    assert.ok(calls[0].includes(path));
    assert.equal(applied.body, undefined);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("creating an issue requires a title and nonempty body file, and returns a small receipt", () => {
  assert.throws(() => parseCommand(["create-issue", "--body-file", "/tmp/unused"]));
  const root = mkdtempSync(join(tmpdir(), "autotm-gh-"));
  const path = join(root, "body.md");
  writeFileSync(path, "");
  const deps = { repo: "owner/repo", gh: () => "https://example.test/issues/1" };
  try {
    const args = ["create-issue", "--title", "A task", "--body-file", path, "--label", "task", "--apply"];
    assert.throws(() => runCommand(parseCommand(args), deps), /empty/i);
    writeFileSync(path, "## Acceptance criteria\n- [ ] Works\n");
    const result = runCommand(parseCommand(args), {
      ...deps,
      gh(call) {
        if (call[0] === "issue" && !call.includes("--body-file")) return JSON.stringify({ number: 1, title: "A task", state: "OPEN", url: "https://github.com/owner/repo/issues/1" });
        return "https://github.com/owner/repo/issues/1\n";
      },
    });
    assert.equal(result.url, "https://github.com/owner/repo/issues/1");
    assert.equal(result.verification.status, "verified");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("safe reads retry transient GitHub failures with bounded backoff", () => {
  let attempts = 0;
  const delays = [];
  const result = runCommand(parseCommand(["issue", "7"]), {
    repo: "owner/repo",
    sleep: (delay) => delays.push(delay),
    gh() {
      attempts += 1;
      if (attempts < 3) throw new Error("gh: HTTP 503: Service Unavailable");
      return JSON.stringify({ number: 7, title: "Ready", state: "OPEN", body: "## Acceptance criteria\n- [ ] Works" });
    },
  });
  assert.equal(result.number, 7);
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [200, 400]);
});

test("safe reads do not retry non-transient failures", () => {
  let attempts = 0;
  assert.throws(() => runCommand(parseCommand(["issue", "7"]), {
    repo: "owner/repo", sleep: () => { throw new Error("must not sleep"); },
    gh() { attempts += 1; throw new Error("GitHub returned 404 Not Found"); },
  }), /404/);
  assert.equal(attempts, 1);
  assert.equal(isTransientGithubError(new Error("gh: HTTP 503: Service Unavailable")), true);
  assert.equal(isTransientGithubError(new Error("422 Validation Failed")), false);
  assert.equal(isTransientGithubError(new Error("404 Not Found for issue #500")), false);
  for (const message of ["Failed to connect to github.com", "Could not resolve host: github.com", "connection reset by peer"]) {
    assert.equal(isTransientGithubError(new Error(message)), true, message);
  }
});

test("writes are never replayed and uncertain outcomes are explicit", () => {
  const root = mkdtempSync(join(tmpdir(), "autotm-gh-"));
  const path = join(root, "body.md");
  writeFileSync(path, "A comment");
  try {
    let writes = 0;
    const result = runCommand(parseCommand(["comment", "issue", "42", "--body-file", path, "--apply"]), {
      repo: "owner/repo", sleep: () => {}, gh(args) {
        if (args[0] === "api") throw new Error("gh: HTTP 503: Service Unavailable");
        writes += 1;
        return "https://github.com/owner/repo/issues/42#issuecomment-123\n";
      },
    });
    assert.equal(writes, 1);
    assert.equal(result.applied, true);
    assert.equal(result.verification.status, "uncertain");
    assert.match(result.verification.reason, /503/);

    const failed = runCommand(parseCommand(["comment", "issue", "42", "--body-file", path, "--apply"]), {
      repo: "owner/repo", gh() { throw new Error("request timed out"); },
    });
    assert.equal(failed.applied, false);
    assert.equal(failed.uncertain, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("queue snapshots preserve pending checks and flag a possibly incomplete list", () => {
  const result = runCommand(parseCommand(["queue", "--limit", "1"]), {
    repo: "owner/repo", gh: () => JSON.stringify([{ number: 7, title: "Pending", statusCheckRollup: [{ name: "pr", status: "IN_PROGRESS", conclusion: "" }], body: "## Execution state\n- **Status:** verifying" }]),
  });
  assert.equal(result.possiblyMore, true);
  assert.deepEqual(result.prs[0].checks, [{ name: "pr", state: "IN_PROGRESS" }]);
  assert.equal(result.prs[0].execution[0].text, "- **Status:** verifying");
  assert.deepEqual(result.omitted, ["full bodies", "comments", "formal reviews", "inline review threads"]);
});

test("full bodies require explicit opt-in and GraphQL failures never become empty history", () => {
  const item = { number: 7, body: "## Context\nThe governing decision is in this section." };
  const deps = { repo: "owner/repo", gh: () => JSON.stringify(item) };
  assert.equal(runCommand(parseCommand(["issue", "7"]), deps).body, undefined);
  assert.equal(runCommand(parseCommand(["issue", "7", "--full"]), deps).body, item.body);
  assert.equal(runCommand(parseCommand(["issue", "7", "--full"]), deps).bodyPreview, undefined);
  assert.deepEqual(runCommand(parseCommand(["issue", "7", "--full"]), deps).omitted, ["comments", "native parent", "native blocking links"]);
  assert.deepEqual(runCommand(parseCommand(["pr", "7", "--full"]), deps).omitted, ["comments", "formal reviews", "inline review threads"]);
  assert.throws(() => runCommand(parseCommand(["comments", "issue", "7"]), { repo: "owner/repo", gh: () => JSON.stringify({ errors: [{ message: "Not authorized" }] }) }), /errors/);
});

test("compact issues preserve the delivery slice and flag body text outside selected sections", () => {
  const body = "## Parent\n#10\n## What to build\nRead the whole ticket.\n## Acceptance criteria\n- [ ] Works\n## Blocked by\n#11\n## Additional context\nA governing decision.";
  const result = runCommand(parseCommand(["issue", "12"]), { repo: "owner/repo", gh: () => JSON.stringify({ body }) });
  assert.equal(result.parent[0].text, "#10");
  assert.equal(result.whatToBuild[0].text, "Read the whole ticket.");
  assert.equal(result.dependencies[0].text, "#11");
  assert.equal(result.bodyPreview.text, body);
  assert.equal(result.bodyPreview.truncated, false);
  assert.ok(!result.omitted.includes("full body"));
  assert.ok(result.omitted.includes("native parent"));
  assert.ok(result.omitted.includes("native blocking links"));
  const bug = compactItem({ body: "## What happened\nA bug outside the ticket template." }, "issue", 20);
  assert.equal(bug.bodyPreview.text, "## What happened\nA b");
  assert.equal(bug.bodyPreview.truncated, true);
  assert.equal(compactItem({ body: "## Depends on\n#3" }, "issue").dependencies[0].text, "#3");
});

test("ordinary comments expose a cursor for omitted history and never claim review coverage", () => {
  const calls = [];
  const result = runCommand(parseCommand(["comments", "pr", "42", "--before", "older-cursor"]), {
    repo: "owner/repo", gh(args) {
      calls.push(args);
      return JSON.stringify({ data: { repository: { pullRequest: { comments: { totalCount: 4, nodes: [], pageInfo: { hasPreviousPage: true, startCursor: "next-older" } } } } } });
    },
  });
  assert.ok(calls[0].includes("cursor=older-cursor"));
  assert.deepEqual(result.pageInfo, { hasPreviousPage: true, startCursor: "next-older" });
  assert.equal(result.surface, "comments");
  assert.deepEqual(result.omitted, ["formal reviews", "inline review threads"]);
});

test("formal reviews keep verdicts and reviewed commits separate from comments", () => {
  const result = runCommand(parseCommand(["reviews", "pr", "42", "--max-chars", "5"]), {
    repo: "owner/repo", gh(args) {
      assert.match(args.join(" "), /reviews\(last: \$limit, before: \$cursor\)/);
      return JSON.stringify({ data: { repository: { pullRequest: { reviews: {
        totalCount: 1, pageInfo: { hasPreviousPage: false, startCursor: "review" },
        nodes: [{ state: "CHANGES_REQUESTED", body: "Please fix this", commit: { oid: "reviewed-sha" }, author: { login: "reviewer" } }],
      } } } } });
    },
  });
  assert.equal(result.surface, "reviews");
  assert.equal(result.reviews[0].state, "CHANGES_REQUESTED");
  assert.equal(result.reviews[0].commit.oid, "reviewed-sha");
  assert.equal(result.reviews[0].body, "Pleas");
  assert.equal(result.reviews[0].truncated, true);
  assert.equal(result.omittedReviews, 0);
});

test("thread comments can page beyond the nested preview and full never removes count limits", () => {
  const result = runCommand(parseCommand(["thread-comments", "PRRT_test", "--after", "next-comment", "--full", "--limit", "2"]), {
    repo: "owner/repo", gh(args) {
      assert.ok(args.includes("id=PRRT_test"));
      assert.ok(args.includes("cursor=next-comment"));
      assert.ok(args.includes("limit=2"));
      return JSON.stringify({ data: { node: { comments: { totalCount: 12, pageInfo: { hasNextPage: false }, nodes: [{ body: "x".repeat(2000) }] } } } });
    },
  });
  assert.equal(result.comments[0].body.length, 2000);
  assert.equal(result.comments[0].truncated, false);
  assert.equal(result.omittedComments, 11);
});

test("inline review threads expose resolution, location and nested comment omissions", () => {
  const result = runCommand(parseCommand(["review-threads", "pr", "42", "--after", "thread-cursor", "--max-chars", "4"]), {
    repo: "owner/repo", gh(args) {
      assert.ok(args.includes("cursor=thread-cursor"));
      assert.match(args.join(" "), /reviewThreads\(first: \$limit, after: \$cursor\)/);
      return JSON.stringify({ data: { repository: { pullRequest: { reviewThreads: {
        totalCount: 2, pageInfo: { hasNextPage: true, endCursor: "next-thread" }, nodes: [{
          id: "thread-id", isResolved: false, isOutdated: true, path: "src/feature.ts", line: 12,
          comments: { totalCount: 12, pageInfo: { hasNextPage: true, endCursor: "next-comment" }, nodes: [{ body: "Fix this", url: "https://example.test/review" }] },
        }],
      } } } } });
    },
  });
  assert.equal(result.surface, "review-threads");
  assert.equal(result.threads[0].isResolved, false);
  assert.equal(result.threads[0].isOutdated, true);
  assert.equal(result.threads[0].path, "src/feature.ts");
  assert.equal(result.threads[0].comments.omittedComments, 11);
  assert.equal(result.threads[0].comments.nodes[0].body, "Fix ");
  assert.equal(result.threads[0].comments.nodes[0].truncated, true);
  assert.equal(result.pageInfo.endCursor, "next-thread");
  assert.equal(result.omittedThreads, 1);
});

test("all discussion reads fail on missing or errored connections", () => {
  for (const command of [["reviews", "pr", "42"], ["review-threads", "pr", "42"], ["thread-comments", "PRRT_test"]]) {
    for (const response of [{ data: { repository: { pullRequest: null } } }, { errors: [{ message: "Denied" }] }]) {
      assert.throws(() => runCommand(parseCommand(command), { repo: "owner/repo", gh: () => JSON.stringify(response) }));
    }
  }
  for (const command of [["reviews", "issue", "1"], ["issue", "1", "--before", "x"], ["review-threads", "pr", "1", "--before", "x"]]) assert.throws(() => parseCommand(command));
});
