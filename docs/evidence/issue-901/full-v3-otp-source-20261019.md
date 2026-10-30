# Full-v3 OTP request and delivery source candidate

Owner: sole #901 writer. This checkpoint follows prerequisite test correction `83b8e110de160750b68d493142ea5e1c25ace271` and is based on bootstrap `5bf30a9181a90eea46b3a2a7f2db2c980e1fae7c`. Root supplied hosted run `39222404041`, API job `117960636046`, exact `5bf30a91`: two bootstrap/refusal cases passed; six failed. The genuine next RED was ordinary HTTP OTP request line 114, expected 201 and received 500 with `Campaign authentication slice unavailable`. The nested TOTP, session, authority, admission, content and disposal assertions were unreached.

This source slice admits only the ordinary sign-in OTP request and its exact delivery ownership for `campaign897-full-v3`. The existing v3 trigger now journals a supported email/sign-in request only when its destination belongs to the fixed fifteen-identity roster, its business and phone fields are null, and its user reference is null or the matching roster user. It writes the exact request ID and email to the reservation ledger in the same transaction, updates the ledger fingerprint, and preserves the existing 128-record/2048-event limits. Session, TOTP enrollment and backup-code writes remain refused. OTP key or destination transfer and deletion remain refused. The shared `withCampaignEmailDelivery` fence keeps the old v1 alias/profile/version query and adds a separate fixed v3 profile/version 3 query that checks manifest binding, all fifteen aliases, the exact OTP row hash, delivery/journal/event fingerprints and ledger ownership. BullMQ job IDs, deduplication IDs and the worker sink adapter are unchanged.

V3 reset validates the ledger and sink journal. It refuses with `Campaign delivery disposal unavailable` while delivery rows exist, because queue/sink disposal is a later reached-evidence slice. It does not mark a namespace disposed while an OTP delivery remains. Existing v1 queue tombstones and disposal behavior are unchanged. Operational CLI/controller/Railway entry points remain closed. No TOTP, session, elevation, staff grant, admission, business activation, content, media, payment, diagnostics or measurement implementation was added.

## Evidence

| Criterion | Evidence | Result |
|---|---|---|
| Correct foreign collision and row-budget prerequisites | API spec correction, hosted setup failures supplied by root | checkpointed; hosted rerun unknown |
| V3 OTP request journal and exact ledger binding | `scripts/staging-campaign.mjs`, `packages/db/src/campaign-email-delivery.ts` | source candidate; SQL/HTTP unknown |
| Preserve v1 and v2 generated paths | `/tmp/issue901-v3-otp-source-compat.log` | pass by fake SQL generation; no PostgreSQL execution |
| Existing ordinary queue and worker behavior | unchanged `BullMqEmailCodeSenderAdapter`, worker module/processor | source inspection; runtime unknown |
| Session/TOTP/authority/admission/content/disposal | unchanged or explicitly closed | unreached/unknown by hosted evidence |

## Local checks

- `node --check scripts/staging-campaign.mjs`: PASS.
- `node /tmp/issue901-v3-otp-source-check.mjs`: PASS. It proves v1 campaign functions and four v2 generated SQL paths are byte-identical; fake transport only.
- `pnpm --filter @auto-tm/db typecheck`: PASS.
- `pnpm --filter @auto-tm/db exec tsc6 --noEmit`: PASS.
- `pnpm --filter @auto-tm/db lint`: PASS.
- `pnpm --filter @auto-tm/db test:unit`: PASS, 97/97.
- `pnpm --filter @auto-tm/api typecheck`: PASS.
- `pnpm --filter @auto-tm/api lint`: PASS.
- Focused API unit command: PASS, 2363 passed, 2 skipped across 257 files. This command's workspace script selected the unit suite; it did not run SQL/Redis/HTTP acceptance.
- `pnpm --filter @auto-tm/db build`: BLOCKED by local configuration because Prisma requires `DATABASE_URL`; no local service was started.
- `pnpm test:staging-control`: bounded local control check, no provider mutation; outcome pending in its log.
- `git diff --check`: PASS.

Root must run the unchanged focused acceptance command on disposable migrated PostgreSQL/Redis/HTTP and classify the first reached behavior. If OTP request passes, report the next exact failure. TOTP, session, elevation, admission, owner redemption, content and reset/disposal remain unknown until their assertions execute. The source candidate is not hosted GREEN or release completion.
