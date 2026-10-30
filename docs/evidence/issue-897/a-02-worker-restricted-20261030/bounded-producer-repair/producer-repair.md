# A-02 bounded producer repair handoff

Status: offline source repair prepared; A-02 remains open. No services, containers,
ports, migrations, resets, database access, builds, package tests, deployments or
timing run in this dispatch.

## Immutable source identity

- Worktree: `/Users/bagtyyar/.t3/worktrees/carberk/t3-fac70050`
- Branch: `t3/issue-897-a02-batch-fixture-producer`
- Start HEAD: `077c4adedf9c6e776e0daca433c7855d968716ec`
- Start tree: `98b1133686e034d06c9038b577e26246c3a7af2c`
- Pinned source base: `8c6fe1d1cc91b44100279a2f82da2a0d5421cc72`
- Original campaign source: `52d901c50af1dde97ea22bda8efb1fdf21f169b1`
- Start status: clean
- Source checkpoint: `f880da06f68ba82ffe6951e10c100868bcfca7c5`
- Source checkpoint tree: `cebca76ff91a6d4077c44e6b022d307a7901fe3d`
- Planning/receipt audit: `git diff --exit-code 8c6fe1d1cc91b44100279a2f82da2a0d5421cc72..077c4adedf9c6e776e0daca433c7855d968716ec -- . ':!docs'` exited `0`, no output.

## Allowed source change

New file only: `apps/worker/src/jobs/diagnostics/testing/produceOwnershipBatchFixture.mjs`.
The accepted ordinary producer, bootstrap, batch suite, production modules,
schemas, migrations and configuration remain unchanged. No boundary test was
needed; the new module has no isolated external seam that can establish runtime
fixture acceptance without the coordinator's services.

## Guarded input and output

The producer accepts one private case config and rejects an unknown selector,
non-loopback API/database, port 5432 or 65379, mismatched private `r6c_batch_*`
database identity, same restricted username, foreign evidence root, wrong
Compose prefix, absent dependency/source pins/migration pin, missing four
ordinary principals, missing visits, or mismatched PostgreSQL resource port.
It verifies every supplied source/compiled SHA-256, the pinned migration
manifest against disk and `_prisma_migrations`, matched source/campaign guard
readiness, a restricted non-owner/non-bypass role, 404 principal sessions and
the 120-second setup deadline. It sends at most five parallel HTTP requests;
each request has a five-second timeout. It declares one real 45-second rights
cutoff after route setup and returns without waiting for expiry.

The output is private `producer.json` plus `fixture.json` in the case evidence
root. `producer.json` records source pins, migration rows, actor/session
readbacks, every ordinary route input (without bearer tokens), response status
and response hash, order IDs, object keys, cutoff, resource identity and
zero source/campaign receipts. `fixture.json` contains the exact batch-suite
fields and private request bindings. Tokens and database URLs stay in the
private fixture path and are never copied to public evidence.

## Ordinary route sequence

For each visit: commissioner creates `orders`; reception assigns technician and
reviewer, authorizes physical/publication work, and moves the appointment through
`confirmed` and `arrived`. Commissioner creates an ownership grant. Technician
observes a VIN through `orders/:id/vehicle` with the grant and exact classified
rights. Selected cases add a second observation to one existing grant, creating
multiple components through the same ordinary route. Proof participants stage
identity provenance, upload the PNG through the ordinary PUT route, and append
identity evidence. Technician creates a report, saves a finding, submits it;
reviewer finalizes it. Reviewer prepares and executes an ordinary continuity
issue request. Consumed-proof fixtures use the ordinary `reinspections` route.
Proof-use race fixtures prepare a consume request and return the exact execute
request twice for the suite's frozen retry. Capture race fixtures return the
ordinary vehicle request for the suite's lock barrier. The oldest-capacity
fixture returns a commissioner ownership-grant request for the new arrival.
The overlimit fixture repeats the ordinary vehicle route 1,000 times after its
initial observation, yielding more than 1,000 raw rows on one grant/order.

The ten selectors receive distinct fresh case databases from the coordinator:
`later-failure`, `shared-multiple`, `oldest-capacity`, `overlimit`,
`worker-first-second-worker`, `second-worker-first-worker`,
`worker-first-capture`, `capture-first-worker`, `worker-first-proof-use`, and
`proof-use-first-worker`. Due grant IDs are read back in the same
`rightsUntil,id` order as the unchanged suite. A consumed proof crosses two
ten-grant groups; the multi-component grant has more than one component; the
oldest case includes a later grant, a due component under a later grant, and an
arrival request; proof-use and capture cases return opponent requests before
cutoff rather than sleeping to expiry.

## Offline verification

- `node --check apps/worker/src/jobs/diagnostics/testing/produceOwnershipBatchFixture.mjs` -> exit `0`.
- `git diff --check` -> exit `0`.
- Source-equality audit above -> exit `0`.

Runtime fixture materialization, all ten unchanged batch selectors, cleanup,
resource identity, timing/CPU and A-02 acceptance remain coordinator-owned and
unresolved until the fresh ordinary resources are provisioned.
