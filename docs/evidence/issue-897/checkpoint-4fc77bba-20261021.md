# Hosted 45a5be4c result and assembled follow-up

Exact hosted candidate `45a5be4cb43c6c61873117bf2201135efb763ec2`, tree `532a1bc02bd8ec989e7ced97dd1ffb2e7f38dd9e7`, main `9fde309c3da17f2661fe9c266504e6e56a1b97c9`. PR Checks run `39521844904` completed with lane/static/DB/frontend/runtime PASS, docs skipped, API and aggregate `pr` FAIL. API job `118967370288` ran 312/313 files and 3029/3032 tests. No manual rerun, staging mutation or release action occurred.

## Reached behavior

All original 17 full-v3 cases pass. All four coordinator cases pass, including promotion, TOTP, stale/foreign refusal and disposal. Three later cases remain red:

- Contact delivery reaches the real sender, then returns `Campaign SMS delivery refused` before the namespace fence. The fixture child process supplies the synthetic candidate, while the real API `beforeAll` on this candidate did not set `AUTOTM_COMMIT_SHA` or explicitly select the mock driver. The reservation remains counted, so the later digest assertion also fails. This is a test transport setup mismatch, not contact GREEN or a source defect. The raw/plane logs are in `/tmp/carberk-next-release-20261020/45a5be4c/api.{raw,plain}.log`.
- Support reaches the planned first source RED: ordinary `POST /api/v1/services/conversations` returns 503 `COLLECTION_DISABLED`. The runtime requires explicit synthetic enablement and admitted user IDs. No bypass is authorized.
- Draft reaches the planned first source RED: personal draft creation returns `Campaign business required`. The v3 guard still requires the root business for `businessId=null`. The next expected source checks are admitted-business ownership and the exact `validatedSteps: []` payload.

Later contact, Support and draft assertions are UNKNOWN.

## Assembled follow-up

Root assembled the contact sender/reset checkpoint and the draft context source on top of `4dd1ecfeb13dfa8a5e5b56b46b142870ee9e8be7`:

- Contact test checkpoints `eefe4297`, `50057052`, `0abd9b0c`, `312ca691` became `6d4c3968`, `e4c82a4e`, `3eaf1dd9`, `4ddee47d`. The suite now saves/restores the exact API test transport environment and adds sender-first/reset-first ordering cases. The original 24 case bodies and helper block are byte-identical; the final static collection has 26 cases.
- Draft source `07fff48a`, `714d8ea1` became `d0c28b1c`, `4fc77bba`. Only v3 text drafts may use personal or journal-admitted business context, and exactly `validatedSteps: []` is accepted. Root and non-v3 guards remain unchanged.
- No contact/coordinator source, schema, migration, operational activation, queue weakening or cap change was made.

## Offline verification

- Sender comparison: 24/24 original cases byte-identical; embedded reset worker syntax passed.
- Draft generated SQL comparison: v1/v2 fixture/reset SQL and receipts byte-identical; v3 differs only in the intended draft context/payload guards.
- API TypeScript 7 and TypeScript 6, focused lint, static full-v3 collection, agent documentation and whitespace checks passed.
- No local SQL, Redis, Docker, staging or provider operation occurred. Generated SQL is serialization evidence only.

The next hosted run must establish contact setup correction, SQL compilation, ordinary contact verify/reuse/disposal, and the first Support/draft source outcomes. Sender/reset race evidence, broader graph disposal, native/browser/deployed acceptance, final independent review, staging restoration, signed artifact and founder approval gates remain open.

