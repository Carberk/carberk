# A-11 final exact-SHA Spec packet gate

- Candidate: `8e8c1e3df91f32223991fdb7c74819a70a14e41a`
- Candidate tree: `704dd30418a36d108ba0c1cd3c9c3f0a9648fa58`
- Reviewer: fresh isolated `issue934` Spec gate, `claudeAgent/claude-opus-5-5`, policy `effort=high`, `fastMode=false`.
- Verdict: **FAIL / OPEN**. Source boundary and prior three source fixes pass; the runtime packet was held.
- Delegated receipt SHA-256: `1470cdb87fb7117fd259c131ead31d8077a062ac2ac8d61d7074f6f9902aeb12`.

The review found two packet-only blockers:

1. `capture-applied-migrations.mjs` treated the bare migration-pin keys as file paths, collapsing all 102 names to `.` and rejecting a correct 102-row database. The packet repair must use the bare keys directly, verify 102 distinct migration folders and hashes, then compare all applied names/checksums.
2. Vitest colours `console.info` receipt output unless colour is disabled, so the cleanup reader could reject a clean run. The packet repair must strip terminal control characters and set `NO_COLOR=1` on the Vitest command.

The review also confirmed the selector, Compose/base setup, container-exec clients, fallback execution, absolute working directories and packet paths, receipt ordering, S3 ordering, explicit database/role absence, syntax, hashes and docs-only allow-list. No runtime or external command ran. This receipt is preserved as coordinator evidence; the delegated review worktree was isolated and no source files changed.
