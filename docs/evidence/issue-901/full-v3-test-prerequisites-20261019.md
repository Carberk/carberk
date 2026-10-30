# Full-v3 test prerequisite correction

Sole #901 writer, branch `agent/issue-901-full-v3-auth-tests-20261019`, base `5bf30a9181a90eea46b3a2a7f2db2c980e1fae7c`. This checkpoint precedes and is separate from the next OTP source slice. It changes only two invalid setup prerequisites in the eight-case API acceptance spec. The other six cases and every existing oracle remain unchanged.

Root supplied hosted run `39222404041`, API job `117960636046`, at exact `5bf30a91`. The foreign collision setup failed at `db.user.create`, line 248, with `users_email_verified_check`, SQLSTATE 23514. The collision refusal/preservation oracle was UNREACHED. The fixture now supplies `emailVerifiedAt: new Date()` for that foreign row only. This is storage setup, with no authentication, session or admission claim.

The budget case failed at line 291 with `Campaign business required`, before its expected row-limit error. It now looks up the existing fixed recovery business before the draft batch and supplies that business ID and its reservation-owned owner actor. It retains 129 draft inserts, 2049 event updates, the same error regexes, rollback/digest equality and exact reset/disposal assertions. It does not ask source to accept personal drafts or activate a business.

The row-limit, event-limit, digest, collision and disposal postconditions remain UNKNOWN until hosted execution reaches them. Root's genuine OTP request RED remains separately established: normal HTTP request expects 201 and receives 500, with `Campaign authentication slice unavailable`. These prerequisite corrections do not resolve that production failure.

Local verification uses API typecheck, TypeScript 6, lint and runtime collection of all eight cases with hooks unexecuted. Logs: `/tmp/issue901-v3-prereq-{ts7,ts6,lint,collection}.log`. No local services or SQL/Redis/HTTP acceptance execution. Root owns the hosted `pnpm test:api` lane and the focused command `pnpm --filter @auto-tm/api exec vitest run src/modules/identity/presentation/CampaignFullV3.e2e.spec.ts --maxWorkers=1` on disposable migrated PostgreSQL/Redis. No CI dispatch/polling occurred.

Docs: no external API/dependency change; fixture fields follow existing schema and reviewed v2 storage-probe semantics.

Final local outcomes: API typecheck, TypeScript 6 and lint PASS. Runtime collection PASS, eight tests discovered, no hooks executed. `git diff --check` PASS. All hosted acceptance outcomes after this correction remain UNKNOWN.
