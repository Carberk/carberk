# Incremental accepted source assembly and R2 fixture repair 1

Sole PR904. This is an intermediate source checkpoint for parent disposition. It establishes no G1 closure, G2/G3, runtime, CI, release or ordinary automatic201 acceptance. Guards remain dormant and automatic public admission remains closed. No runtime authority was exercised.

## Preserved constituent checkpoint

The host-created checkout started clean at parent `9bcbf1e6f325a9a36cba98fa6e8c796b4e67a408`, tree `6dd9c3f2401d556a97ba7377a2a5dd96f2b56d6d`. Branch `agent/issue-897-g1-source-assembly-20261025` contains normal non-rewriting merges of exact R7a `09d15b8c2b952242b8d7bc079f4f14693eab0bdb`, R2 `0efe627ce6be4c97679a1b888f5a5c003f3b4f10` and corrected R5 `9d58d25bf1bdc65b2458340103b7739c4d0b3685`. R7a contains R1; R5 contains R3, mapping and R4. Their changed-path sets from `77492d6c6096d65460403128c25384053551a28f` are disjoint. All 107 tip-owned blobs survived byte-exactly; all 91 other changed/deleted paths matched that common accepted ancestor. No conflict or compatibility edit was required.

Before fixture repair, clean commit `288cc2dcaee9094c8674be76a6e95769c36a6d99`, tree `4c8847d850d092ec31f9a003c4bd7f0fd6c16752`, was recorded and pushed. Historical acceptance of R5 at3227 was superseded only by the exact adapter-shape acceptance at9d58; both receipts remain historical. No diagnostic runner, B5, R6a, R7f or pending R7d source was selected. PrismaUploadClaims.ts remains read-only and unchanged.

## Demonstrated fixture defect and bounded remedy

Parent authority is `/tmp/897-r2-fixture-runtime-defect-parent-disposition-20261025.md`, repair attempt1 of actual maximum3. Diagnostic40188183964 at08551e0d applied 86 migrations but failed beforeAll Session.createMany with P2002: one oldHash was used for 40 Sessions. All 22 cases were skipped and no caller case ran. Cleanup succeeded and the arm was removed. This run remains spent, with no retry authorized.

Applied the diagnosing-bugs skill. The offline declaration reproducer retained the original shared hash, incoming/expiry/unused output values and shared refusal owner. Four tests failed. The first two independently exposed the global hash collision and output collision; the third exposed four refusals sharing one owner; the fourth checked actual bcrypt ownership of the expected old value. The old declaration and RED log remain under `/tmp/897-r2-fixture-red-declaration-20261025.ts` and `/tmp/897-assembly-r2-fixture-red-20261025.log`.

The fixture module now owns the actual complete reusable seed declaration consumed by SQL setup and case lookup, rather than an unused source-only test helper. It retains the 20 original seed families and adds 4 independent refusal fixtures: 72 Users, 48 seeded Sessions, 24 enrollments, 22 initial backup codes and 72 staff grants. Every seeded Session hashes its own logical plaintext through the actual BcryptHasherAdapter. CAS inputs use the exact stored staff hash. Incoming, rotated, live and refusal hashes are distinct per case. Existing one-use backup code values are legitimate per-enrollment values, not globally unique columns.

Each refusal creates its pending enrollment through the real createPending(other) caller and its Session through the real Session repository, against a distinct fixture's other User. Missing uses an absent id; foreign uses that fixture's staff Session owned by a different User; expired rotates that exact newly created Session from its own unused hash to its own expired hash; inactive grants no capability. Each pending enrollment remains unverified with no codes or elevation. Existing first-verification, backup, staff-management, destination and OTP caller behavior is unchanged.

Both barrier-release paths now await all captured outcome promises in finally after releasing their gate, so a failed PID/assertion cannot escape before the started caller drains. No retry, timeout, weaker refusal, skipped case, role privilege, source guard or readiness change was introduced. No production file changed.

## Complete constraint and lifecycle audit

`packages/db/prisma/schema.prisma` is unchanged. User PK/email/phone uniqueness and paired verification checks are satisfied by distinct suite IDs and verified synthetic email with null phone; name/avatar use existing lawful defaults. Sessions have unique PK and global refreshTokenHash, existing User FK, future expiresAt and manager elevation. Output hash checks cover the entire retained Session population plus refresh winners/losers, both incoming Sessions, prune expiry/live values and each refusal's unused/expired values. Runtime-generated IDs retain the production UUID allocator and database uniqueness checks.

TotpEnrollment has unique id/userId and User CASCADE FK. Only first-left/right begin pending; all other seeded staff enrollments begin verified. Other Users have no seeded enrollment, so each refusal's actual createPending is fresh. Backup PKs reference existing enrollments, start unused by the database null default and retain one-use hashes scoped by enrollment. StaffGrant composite userId/capability keys are distinct; all three capability strings are in the existing check constraint. Manager Sessions belong to the manager holding staff.manage and founder.control, with live elevation; staff holds diagnostics.technician. Revocation/no-op/rollback cases retain their original independent family state.

The pending-request fixture retains unique center code, template center/version, order request key, primary keys and correct FKs. Both request actors own their referenced Sessions; the order is not erased, satisfying the immutable request-binding trigger in `20261023110000_diagnostic_continuity_requests/migration.sql:20`. Both kinds remain issue. Session and enrollment deletion retain real cascading deletion assertions and foreign sentinels. No proof/report/ownership fixture is fabricated.

Setup still inventories only the existing diagnostic/campaign guards, seeds before activation, enables them, requires both readiness functions, and verifies the actual role is neither superuser nor table owner. Runtime still rejects locks/writes before preparation, leaves transaction options unchanged, requires actual pg_blocking_pids waits with its existing 2 second deadline, and preserves inherited guard modes and role teardown. Guard-restoration and disposal behavior are authored only; this repair supplies no SQL execution proof.

| Existing case selection | Static reachability and retained outcome |
| --- | --- |
| refresh left/right,2 | Distinct live staff Sessions, exact own old hash and distinct new hashes; one true winner/false loser and exact stored winner. |
| first verification left/right,2 | Fresh pending staff enrollment, live own Session and active grant; atomic verification/codes/elevation, exact pending-error loser. |
| backup reuse left/right,2 | Verified enrollment with one unused code, live staff Session; exactly one burn/elevation and false loser. |
| revocation left/right,2 | Qualified manager and live target; actual revoke/elevate opposition, exact refusal or existing stale-inventory outcome retained. |
| delete/create left/right,2 | One older seeded staff Session and distinct incoming hash; existing incoming survival and graph-change refusal preserved. |
| destination left/right,2 | Unique new verified email, separate existing staff owner; actual insertion/replacement fences and exact busy/held-destination outcomes. |
| OTP left/right,2 | Separate suite phone/IP per direction, live existing User; real reservation before destination/IP locks, one retained reservation. |
| cascade,1 | Independent cascade-left graph; delete actual staff Session/request, retain manager/foreign request, delete enrollment/code by real FKs. |
| staff no-op/regrant,1 | Independent noop-left grant and manager authority; zero/one/two exact audits, no source receipt residue. |
| expired pruning,1 | Exact own CAS expires only old staff Session; distinct new live Session and manager sentinel survive. |
| rollback,1 | Existing backup-left and destination-right distinct retained scopes; real caller rollback leaves exact Session/grant/audit/code/elevation state. |
| missing/foreign/expired/inactive refusal,4 | Four distinct other Users, pending enrollments and Session spaces; legitimate manager setup then exact SESSION_NOT_FOUND with no verification/code/elevation. |

Static TypeScript parsing, without E2E import, confirms identical 12 test declarations expanding to 22 cases and 55 expect calls. Only the setup lookup and expired-pruning CAS input expressions changed within expect; literal outcome assertions are unchanged. Real PID waits, restricted role, readiness, rollback sentinel and zero retries were checked explicitly. Full audit output is `/tmp/897-assembly-r2-fixture-static-20261025.log`.

## Offline evidence and remaining gates

Unmodified assembly: 356 tests in 20 files, 36 closed-admission tests in 2 files, 17 profile/preservation tests, configured contracts/DB/API builds, TS6/TS7 for API/DB/contracts/worker/mobile, focused API/DB lint, runtime imports and diff checks passed. R5 schema/profile and every historical SQL/mirror/inventory are retained exactly. The new fixture checks exercise actual reusable seed allocation, unique hashes including outputs, complete references, isolated pending owners and CAS old values with real bcrypt, without importing or collecting E2E.

After repair, 68 affected offline tests, the static 22-case audit, API TS6/TS7, focused lint and API build passed. The final diff check also passed. Exact commands, final hashes, results, source preservation and final clean pushed head/tree are in `/tmp/897-incremental-source-assembly-20261025-manifest.json` and its handoff. All original R4/R5/R6a/R7a obligations remain owned by the existing G1 manifest, including enabled-public/purge/foreign/erasure/race coverage, real rollback/lock proof, matched activation/admission and ordinary genuine-grant automatic201. No acceptance obligation is closed here. Parent owns next disposition and integration.
