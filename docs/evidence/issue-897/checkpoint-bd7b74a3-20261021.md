# Hosted checkpoint bd7b74a3, 2026-10-21

Exact candidate `bd7b74a35605cfa823caa45f6ce26ed1250a0b52`, tree `fb01d8fc9c51aaea67303f2789e0f67b0b1fd1a5`.

PR Checks [39549447350](https://github.com/Carberk/carberk/actions/runs/39549447350) completed with lane, static, DB and frontend success; docs was skipped. API [119055127798](https://github.com/Carberk/carberk/actions/runs/39549447350/job/119055127798) failed. Aggregate [119058004494](https://github.com/Carberk/carberk/actions/runs/39549447350/job/119058004494) failed only because API failed. Runtime [39549447304](https://github.com/Carberk/carberk/actions/runs/39549447304/job/119055041664) succeeded. No rerun was requested.

API passed 313/315 files and 3045/3049 tests. Worker passed 54/54 files and 356/356 tests. Full-v3 passed 25/28 cases. There are four failing tests and five assertion records, because the coordinator case reports both its body and finally reset failures.

## Reached failures

1. Reinspection remains RED. Existing setup reached the missing route at `DiagnosticReports.e2e.spec.ts:308`, which returned 404 instead of 201. The earlier eleven diagnostic cases passed. No new source or policy conclusion follows.
2. The older coordinator cleaning/disposal case fails reset at full-v3 lines 1150 and 212. Its setup directly changes only `campaign_manifest.state` to `cleaning`. The new object inventory guard requires a matching `object_hash` for every non-identities state. The fixture therefore no longer represents the complete cleaning intent. Root assigned a metadata-only prerequisite correction after checking the source; no guard relaxation is authorized. The test must first prove the ledger and owned media set are empty, then preserve all reset, promotion-denial, digest and no-resurrection assertions. Hosted GREEN for that correction is still UNKNOWN.
3. The new Support case reaches its intended behavioral RED at line 1509. Ordinary authentication, grants, assignment and the literal 76-record/96-event journal assertion succeed; `close_resolved` returns 503 instead of the ordinary 400 response-debt refusal. The server logs `COLLECTION_DISABLED`. The snapshot remains unchanged before that assertion. Later closure/reopen, exact ledger and disposal assertions have not executed.
4. Media progresses beyond the prior journal RED. Three ordinary conditional presigns, upload ownership assertions, WebP PUTs and the Sales draft succeed. Publication at line 2108 returns 500 instead of 201. The server and PostgreSQL logs identify `Campaign phone collision`; root traced the contact fence's missing owned-Listing admission. This is not media GREEN. Later publication/removal/disposal assertions remain unexecuted. No extra media finally-reset assertion failure is reported in this run; that does not prove complete object absence or the rest of the journey.

## Next owned work

`release897-v3-media-support-source-20261021-r1`, Sol 6.1 medium, owns the disjoint scripts/API source slice from this exact candidate. Its remote reservation `agent/issue-901-media-support-source-20261021` was created and independently read back through GitHub's git/refs API before dispatch. It must return separate checkpoints for the exact owned publication contact fence and reservation-aware Support commands/journal disposal. No e2e test edits, weakened collisions, new protocol/schema or activation are authorized.

The media test writer returned pushed checkpoint `24709a53ea7134beb54fcb94f0280c0613dbf1a7`, two prepared race cases plus evidence, followed by `fa5c2167b67176151cf35170bfa370714fbcdedd` for the older cleaning fixture. The follow-up asserts an empty protected object ledger and no journaled media records before supplying the literal empty-object hash. All prior b9 assertions and both race cases remain intact. Root inspected both diffs and the writer's offline verification receipts before assembly. Neither checkpoint establishes hosted behavior. The writer is terminal; root assembles serially with `cherry-pick -x` and batches the next push.

The race writer explicitly reports that its stream barrier establishes SDK body consumption, not server-side If-Match evaluation. Those are different claims. Provider acknowledgement of the precondition before reset remains unproven. Existing protocol, guards, caps, timeouts and concurrency stay unchanged.

## Log pointers and limits

API raw/plain logs: `/tmp/carberk-next-release-20261021/bd7b74a3-api.{raw,plain}.log`. Failure summary is at 2535-2674; Support and media server errors at 2507-2534; the PostgreSQL phone error at 2888. Totals are at 2671-2672 and worker totals at 1597-1598. Aggregate raw/plain logs use the same prefix with `pr`; lines 55-66 show API as its only failed dependency. `gh api` required its explicit `--allow-escape-sequences` option to save raw logs; root stripped ANSI sequences into separate plain files before printing bounded excerpts.

No local services or integration behavior ran, and no CI dispatch, Railway operation, provider activation or release approval occurred. Independent fixed-SHA review, complete graph/race/capacity proof, native/browser/deployed/ops acceptance and restoration, signed Android artifact/disclosures and founder-owned gates remain open. This receipt certifies only the named assertions on the exact candidate.
