# A-02 affected verification slot, 2026-11-02

Owner is the sole A coordinator. Source under verification is
`4199eb86d4846fecc6b53edca6c447ec868b1566`; intervening commits may only record
evidence documentation. No other ticket worker or package verification slot is
active. This reserves one local serialized package-check slot, with one Vitest
worker and no A-04, native, deployment, runtime fixture or heavy timing run in
parallel. Normal desktop load is present; no CPU-affinity or performance claim
is made. No Compose, DB, Redis, object store, API endpoint or port is reserved
or started by this slot.

Run the following argv serially from the coordinator worktree:

```text
node --check apps/worker/src/jobs/diagnostics/testing/produceOwnershipBatchFixture.mjs
node --test apps/worker/src/jobs/diagnostics/testing/produceOwnershipBatchFixture.test.mjs
pnpm --filter @auto-tm/worker typecheck
pnpm --filter @auto-tm/worker exec tsc6 --noEmit
pnpm --filter @auto-tm/worker lint
pnpm --filter @auto-tm/worker test:unit --maxWorkers=1
```

Record actual UTC start/end/duration, exit and complete output per command in
`assembled-verification-20261102.json` and private raw logs under
`/tmp/897-r6c-a02r2-20261030/producer-repair/assembled-4199eb86/`. Stop on the
first failure and preserve its RED. No accepted ordinary full100, restricted
preparation, reset-cycle or hosted evidence is repeated here. The batch runtime
suite is held for exact-SHA independent review and a separate resource/timing
reservation. These checks cannot establish ten-case acceptance or cleanup.
The slot releases at terminal completion/failure, before another package run.
