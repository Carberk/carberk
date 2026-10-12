# Bail and recovery

Preserve evidence and make recovery obvious. Never reset, stash, delete, or overwrite user work to make a run look clean.

## State classes

### Preflight failure before reservation

No branch exists and implementation did not begin. Report the failed readiness condition. Add an issue comment only when the issue needs a durable blocker note.

### Reservation or local changes before a pushed checkpoint

Keep the pushed `agent/issue-<N>` reservation branch and working tree exactly as-is. Comment on the issue with branch/HEAD, files changed, known command state, failure/root cause, attempts, and the next safe action.

### Pushed checkpoint without a draft PR

Keep the remote branch and checkpoint. Comment on the issue with the exact branch and SHA, completed acceptance criteria, verification state, current failure, interrupted commands, repair attempts, documentation and docs-lookup state, and one concrete recovery action. The next run resumes this attempt and creates the one draft PR; it never opens a replacement branch or PR.

### After the draft PR exists

Update its single `Execution state` to `blocked` with:

- branch and last pushed checkpoint SHA;
- completed acceptance criteria;
- verification already passed;
- current failure and root cause;
- interrupted commands and whether their result is unknown;
- repair attempts;
- documentation and docs-lookup state; and
- one concrete next action.

Keep the remote branch and PR open. Never open a replacement PR or directly close the issue.

## Bail immediately when

- required product intent or architecture authority is missing;
- the working tree contains overlapping user changes;
- destructive recovery would be required without authorization;
- the same root failure survives three focused repairs;
- required credentials, service, hardware, or host gate is unavailable;
- a design decision remains open; or
- a conflict has multiple valid semantic resolutions.

Temporary logs and generated evidence belong under `/tmp`, not a committed or ignored tool directory.

## Recovery contract

Route every preserved attempt through `resume-issue <N>`. The incoming agent inspects issue, branch, worktree, PR, checks, comments, processes, and diff before selecting the safest deterministic continuation. It pauses only for destructive or semantically ambiguous recovery.
