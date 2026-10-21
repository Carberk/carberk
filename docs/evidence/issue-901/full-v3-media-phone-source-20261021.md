# Full-v3 Listing contact fence source checkpoint, 2026-10-21

Bounded #901 implementation under #897 / PR904, based exactly on `bd7b74a35605cfa823caa45f6ce26ed1250a0b52`. Reused host worktree `t3-7bcc481b`, initially clean at that SHA. Created local `agent/issue-901-media-support-source-20261021`; independent `gh api repos/Carberk/carberk/git/ref/heads/agent/issue-901-media-support-source-20261021 --jq .object.sha` returned that exact base before edits. Root's reservation proof is `/tmp/carberk-next-release-20261021/media-support-source-reservation-verified.json`. No reservation push, agents, review, PR or issue mutation.

## Cause and change

Hosted RED supplied by root: PR Checks39549447350/API119055127798. `/tmp/carberk-next-release-20261021/bd7b74a3-api.plain.log` lines 2520–2535 report `DriverAdapterError: Campaign phone collision`; lines 2888–2890 identify the `public.listings` INSERT and trigger line 55. The unchanged media case reached ordinary sign-in/TOTP/admission/contact/Sales invitation, three presigns, WebP uploads and draft creation before publish failed. Both the trigger phone fence and SMS inventory unconditionally excluded Listings carrying the admitted business contact.

Only full-v3 SQL generation changes. The pending exception requires the exact current trigger INSERT in identities, derived ownership, no previous Listing journal key, exact reservation/candidate/destination/business/contact-owner binding, current journaled active synthetic business, redeemed owner and current journaled owner/sales publisher. Inventory permits that same exact row only inside the AFTER trigger, before journaling. Everywhere else the Listing requires a live journal key and matching row hash with the bound business/contact checks. The existing Listing publication shape, immutable keys, candidate/contract/journal checks, foreign scalar fence, cleaning lock checks, disposed refusal and caps remain in force. No Listing UPDATE path is admitted by the phone fence. No foreign Listing, User, business or arbitrary phone is admitted.

The existing hosted case is the behavioral regression seam. SQL capture tests cannot execute the trigger or prove foreign-row refusal, so no source-string mirror test was added.

## Verification

- `node --check scripts/staging-campaign.mjs`: pass.
- `node --test scripts/staging-campaign.test.mjs scripts/staging-control.test.mjs`: 54/54 pass, no services.
- `/tmp/issue901-media-support-comparison.mjs`: exact-base VM capture comparison passes for v1 and v2 fresh fixture, existing-fixture retry and reset, SQL and receipts byte-identical. V3 receipts also identical. Captured SQL is `/tmp/issue901-media-support-v3-generated.sql` and `...-reset-generated.sql`.
- `pnpm check:agent-docs` and `git diff --check`: pass.
- Both API compilers initially reported missing unbuilt `@auto-tm/db` and contracts. Offline prerequisites: contracts build, Prisma generate and db build with unreachable `postgresql://offline:offline@127.0.0.1:1/offline`; no database connection or migration. `pnpm --filter @auto-tm/api typecheck` and `pnpm --filter @auto-tm/api exec tsc6 --noEmit` both pass after prerequisites.

Docs: no new external API or dependency; existing PostgreSQL trigger and journal contract only. No product transition or schema change.

Hosted GREEN, SQL/PLpgSQL compilation, media publish/rollback/foreign race behavior and exact ledger/reset readback remain UNKNOWN. Root owns those gates on the assembled candidate; no local Docker/services/integration, CI dispatch or provider actions were run.
