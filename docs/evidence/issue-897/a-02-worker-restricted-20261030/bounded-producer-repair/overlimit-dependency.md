# A-02 overlimit fixture dependency — OPEN

The offline producer worker reported a dependent incompatibility and stopped
that case before runtime or scope expansion. Other case audits continue. No
production source, migration, guard, assertion or protected data was changed.

## Exact constraint and source trace

Unchanged `DiagnosticWorkerOwnershipBatch.e2e.spec.ts:199–202` requires exactly
one selected due grant and more than 1,000 raw identity records belonging to
that grant's **single order**, then expects `diagnostic_source_scope_limit`
and exact rollback state. Its preserved intent is bounded capacity refusal
without partial ownership. Current source is the pinned
`4b2c8a6f6161f9c825945637f6f848c64adeb145` plus docs; the worker starts at
`077c4adedf9c6e776e0daca433c7855d968716ec`.

The sole ordinary `POST orders/:id/vehicle` path at
`PrismaDiagnosticIntake.ts:349–365` prepares `observation_append` with the
inspection order, planned raw/component and audit before any append. The
effective `diagnostic_source_scope` delegates through the maintenance wrapper
(`20261026016200…/migration.sql:247–268`) to the earlier scope implementation.
`20261024010000_diagnostic_source_guard_repair/migration.sql:234` refuses a
discovered scope above 1,000. Its FK expansion includes all raw records related
to a selected inspection order, plus components/audits and other graph rows.
Consequently guarded ordinary append refuses before it can construct an order
with more than 1,000 raw records. No number of ordinary retries supplies the
required graph under these invariants.

The coordinator read back the controller/planned mutation, scope cap/FK loop
and maintenance delegation. This is static source diagnosis, not runtime proof
of either refusal or cleanup. The draft overlimit loop is being removed rather
than presented as a working producer. No foreign resource or port was contacted.

## Disposition and remaining authority

The overlimit prerequisite is OPEN. The worker has no authority to edit the
test, ordinary API, `diagnostic_source_scope`, migration, cap or bootstrap lane.
Changing fixture authority or the exact case constraint needs a separate
bounded disposition; ordinary fixture permission is already granted and is
not the blocker. No founder permission request for routine fixture production
is introduced.

Parent receives this concrete evidence for criterion/authority disposition.
A lawful alternative might exercise a greater-than-1,000 aggregate worker
scope built from individually legal ordinary graphs, but that is only a
proposal: its relationship to the governing criterion and preserved test
assertions must be established before any test repair. A privileged or
pre-guard protected-row fixture is not authorized. A-02 cannot pass with this
case skipped, replaced silently or labelled PASS from source inspection.
