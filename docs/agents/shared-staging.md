# Shared staging reservation

Operational contract prepared for [Proposed ADR-0098](../adr/0098-integration-delivery-with-shared-staging-and-concise-agent-guidance.md). Activation requires the [transition gates](../prd/ops/89-integration-delivery-transition.md). Reservation automation and guarded staging fixture/reset operations are pending; the current `native-pr-seed` intentionally rejects staging. Preserve that guard until its replacement is implemented and verified. Use the [deployment runbook](../prd/ops/80-deployment-runbook.md) for service procedures.

## Reserve

Chief of Staff records one durable exclusive reservation with parent/PR, owner, candidate SHA, purpose, founder priority, ready time, project/environment/service IDs, state, evidence and recovery action. Order by founder priority, then first ready. Implementation remains parallel while waiting; deploys, migrations and resets are serialized under the owner. Final acceptance follows review/fixes; investigations and reviewer device proof may reserve earlier.

## Mutate and verify

1. Verify the selected environment is staging from authoritative Railway identity, not only a URL/name. Check explicit project/environment/service IDs, credential scope and data/media origins; refuse production or ambiguous identity. Keep secrets out of logs/evidence.
2. Within an activated reservation, Chief of Staff may deploy, migrate, reset disposable staging data and restore without repeated approval. Execute only verified staging operations. The API pre-deploy command owns migrations. Production release and production data remain separate.
3. Confirm successful deployment IDs and exact backend SHA, `/readyz`, worker boot, media readiness and expected mock delivery configuration. A previous green deployment is insufficient. Record mobile bundle/backend origins and device/Metro ownership for native proof.
4. Collect criterion-level deployed acceptance against the candidate. On failure, keep the reservation, fix the integration candidate and rerun affected repository and staging evidence. Serialize reseeding; it invalidates sessions and mutable fixture state.

## Restore and release

After success, failure or interruption, stop owned sessions and restore the latest fetched `main`, not the original reservation base. Reset data/schema where persistent migrations or fixtures require it, using guarded staging procedures. Verify successful deployment SHA, readiness and fixture/data disposition before marking released. Failed or unknown restoration keeps the reservation active/blocked and names the next owner/action. A recovering Chief of Staff inspects identity, deployment, processes and state before another mutation.

Disposable hosted PostgreSQL/Redis/MinIO remain the repository test lane. Tests that truncate, drop schemas or purge records never run on shared staging. Staging evidence establishes deployed acceptance, not passing repository suites.
