# Shared staging reservation

Operational contract prepared for [ADR-0098](../adr/0098-integration-delivery-with-shared-staging-and-concise-agent-guidance.md). Activation requires the [transition gates](../prd/ops/89-integration-delivery-transition.md). The [executable control foundation](shared-staging-controls.md) provides durable reservations and a narrow owned application fixture path, with activation still gated by independent review, hosted SQL proof, authoritative live identity/origins and a reserved deployed restoration drill; the current `native-pr-seed` intentionally rejects staging. Preserve that guard until its replacement is implemented and verified. Use the [deployment runbook](../prd/ops/80-deployment-runbook.md) for service procedures.

## Reserve

Chief of Staff records one durable exclusive reservation with parent/PR, owner, candidate SHA, purpose, founder priority, ready time, project/environment/service IDs, state, evidence and recovery action. Order by founder priority, then first ready. Implementation remains parallel while waiting; deploys, migrations and resets are serialized under the owner. Final acceptance follows review/fixes; investigations and reviewer device proof may reserve earlier.

## Mutate and verify

1. Verify the selected environment is staging from authoritative Railway identity, not only a URL/name. Check explicit project/environment/service IDs, credential scope and data/media origins; refuse production or ambiguous identity. Keep secrets out of logs/evidence.
2. Within an activated reservation, Chief of Staff may deploy, migrate, reset disposable staging data and restore without repeated approval. Execute only verified staging operations. The API pre-deploy command owns migrations. Production release and production data remain separate.
3. Confirm successful deployment IDs and exact backend SHA, `/readyz`, worker boot, media readiness and expected mock delivery configuration. A previous green deployment is insufficient. Record mobile bundle/backend origins and device/Metro ownership for native proof.
4. Collect criterion-level deployed acceptance against the candidate. On failure, keep the reservation, fix the integration candidate and rerun affected repository and staging evidence. Serialize reseeding; it invalidates sessions and mutable fixture state.

## Restore and release

After success, failure or interruption, stop owned sessions and restore the latest fetched `main`, not the original reservation base. Reset data/schema where persistent migrations or fixtures require it, using guarded staging procedures. Verify successful deployment SHA, readiness and fixture/data disposition before marking released. Failed or unknown restoration keeps the reservation active/blocked and names the next owner/action. A recovering Chief of Staff inspects identity, deployment, processes and state before another mutation.

## Prelaunch clean reset

Until public launch, all staging and production application data is disposable test data ([#897 founder decision](https://github.com/Carberk/carberk/issues/897#issuecomment-6314266361)). Acceptance uses an exclusive reservation with a quiesced environment reset and reseed between independent groups, under the [clean-acceptance contract](../evidence/issue-901/prelaunch-clean-acceptance-contract-20261021.md). That replaces per-reservation preservation of unrelated test rows. It is not executable permission: the operation needs its reviewed implementation and tests, a verified reference bundle and authoritative target identity. Production is a separate target and manifest, never a default, and remains outside this reservation's authority. Wiping proves no product deletion or retention behavior. Public launch ends the authority.

Disposable hosted PostgreSQL/Redis/MinIO remain the repository test lane. Tests that truncate, drop schemas or purge records never run on shared staging. Staging evidence establishes deployed acceptance, not passing repository suites.
