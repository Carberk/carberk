# Media source assembly, 2026-10-21

Root assembled the #901 media source as `d85d11c1`, above published integration `46f9ab8a94c89a93e9fef9870f59646b0631886f`. Source checkpoint `aa780b8164babe2ad5fc5c86b66e8f6ff854f40b` and its test prerequisite `643be6b8` are both represented in that assembly. The cherry-pick initially conflicted in `CampaignFullV3.e2e.spec.ts` because source was picked before its prerequisite. The assembled file matches the source checkpoint, preserving both the existing tests and credential forwarding. Do not cherry-pick the prerequisite again.

Root inspected the five-file combined increment, exact-key disposer, journal ownership checks, foreign-reference refusal and cleanup transitions. Offline checks passed:

- Both changed scripts pass `node --check`.
- Focused campaign unit tests pass 11/11.
- The affected staging suites pass 155/155, with no failures, cancellations or skips. Command: `node --test scripts/staging.test.mjs scripts/staging-control.test.mjs scripts/staging-ledger.test.mjs scripts/staging-railway.test.mjs scripts/staging-remote.test.mjs`.
- API TypeScript 7 and TypeScript 6 checks, focused ESLint, agent-docs and diff checks pass.
- Eight generated v1/v2 SQL and receipt captures remain byte-equivalent to the writer base. Root capture: `/tmp/carberk-next-release-20261021/d85d11c1-v1v2-capture.json`; comparison capture: `/tmp/i901/sol-base.json`.

These checks establish no new hosted SQL/runtime result. The media case remains RED at published `46f9ab8a` until the same test runs on the source candidate. Recorded generator PUT/reset races, both worker recovery branches, retry after disposal, foreign preservation and terminal digest stability remain required. The [source handoff](../issue-901/full-v3-media-source-20261021.md) now distinguishes accepted empty-placeholder/orphan-sweeping costs from unfinished release coverage.

Root also preserved diagnostics bootstrap proposal `412e7f8ce7aefcee163e2b89d56c0e36181c6f99` with `cherry-pick -x` as `58d5b755`. It is a proposal, not architecture approval or source authorization. Synthetic qualification issuer/provenance, the proposed two-hour validity binding, diagnostic audit disposition and the admission contract still require decisions before source assignment. The writer missed the required pre-edit remote reservation push. Its checkpoint push timed out. A fresh GitHub ref read found no remote reservation branch; the local checkpoint is preserved here. No runtime or operational authority follows from preserving it.

Fresh GitHub refs at recovery show main `9fde309c3da17f2661fe9c266504e6e56a1b97c9` and integration `46f9ab8a94c89a93e9fef9870f59646b0631886f`. The read-only `git ls-remote` hung and root terminated that owned process; the GitHub API read succeeded. No guard refusal or staging operation occurred. PR904 remains draft with auto-merge disabled. These local commits are held for the next source/test batch, rather than a separate documentation push.
