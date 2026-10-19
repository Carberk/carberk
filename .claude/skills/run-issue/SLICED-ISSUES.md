## Sliced issues (ADR-0082)

[ADR-0082](../../../docs/adr/0082-an-issue-may-carry-up-to-three-ordered-slices.md) lets one issue carry up to three ordered slices. It still owns one branch, the parent integration PR, one Execution state and one writing worktree.

- **Gate.** One user-visible outcome; at most three slices, each depending on the one before; a slice that changes authentication or sessions, upload ownership, a destructive or data-moving migration, the worker, or external egress is its own issue; about 800 changed lines excluding tests, generated files, snapshots and lockfiles. Slices that could run in parallel stay separate issues. A three-slice issue goes to a Claude Opus or Codex implementer.
- **Issue body.** Each slice is a numbered section with its own acceptance criteria and one focused check.
- **Execution.** Work the slices in order. After each one, run its check, push a checkpoint commit and tick the slice in Execution state with the commit SHA; resume at the first unticked slice. Past the diff budget, stop at the next slice boundary and report, and the remaining slices move to a follow-up issue.
- **Real-path proof.** At least one test or native capture exercises the outcome with no mock on the seam between slices.
- **Review.** One Standards and one Spec review at the final head, as for any issue; Spec checks every slice's criteria and the real-path proof. One native capture session covers the issue.

