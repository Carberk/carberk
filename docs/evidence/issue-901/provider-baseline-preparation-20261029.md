# Provider baseline preparation

Read-only coordinator preparation for the existing exclusion experiment. This does not qualify desired-zero behavior, grant a reservation, enable reset or establish restoration.

Explicit staging identity was read through authenticated Railway CLI 5.71.0: project `176ddec0-dd65-4087-b82c-798599fc2ebe`, environment `652abc79-fdb0-48b0-9f6c-ad0ff572d7b2`, access true. All four application services and PostgreSQL, Redis and MinIO match the existing recorded IDs.

The live schema and official CLI source establish the read paths used here. Docs: [CLI 5.71.0 release](https://github.com/railwayapp/cli/releases/tag/v5.71.0), published 19 October 2026; [scale source](https://github.com/railwayapp/cli/blob/v5.71.0/src/commands/scale.rs). The provider's current `Environment.config` scalar was read with `decryptVariables:false`; only its digest and selected nonsecret deployment fields left the credential-owning process.

| Service | Desired region/replicas | Current deployment state | Restart policy | Sleep |
|---|---|---|---|---|
| API | `sfo: 1` | SUCCESS, one RUNNING and one REMOVED instance record | ON_FAILURE, 5 retries | false |
| worker | `sfo: 1` | SUCCESS, one RUNNING instance record | ON_FAILURE, 5 retries | false |
| admin | `sfo: 1` | SLEEPING, one instance record | ON_FAILURE, 5 retries | true |
| web | `sfo: 1` | SLEEPING, one instance record | ON_FAILURE, 5 retries | true |
| MinIO | `sfo: 1` | SUCCESS, one RUNNING instance record | ON_FAILURE, 10 retries | false |

All application deployments identify main `9fde309c3da17f2661fe9c266504e6e56a1b97c9`. Cron is null on these five service instances. PostgreSQL and Redis desired region maps are also `sfo: 1`; their configuration was not changed.

The legacy `ServiceInstance.region` and `numReplicas` fields returned null. The actual desired multi-region maps came from the authoritative environment config. `railway scale` without assignments returned `No linked project found` despite explicit project/environment/service flags; that refusal is retained and no linking or mutation was attempted. Neither that command nor two matching snapshots prove automatic execution exclusion.

Private runtime baseline is `/tmp/897-railway-provider-baseline-private-20261029.json`, SHA-256 `372e3a5fd43180cbbed5f10503f01b7acbc38be7787ddb7bb1148de946d63af5`. Sanitized desired config is `/tmp/897-railway-desired-config-sanitized-20261029.json`. Its full-config digest is `8e3ef7247b1a91ac37b023d08600001b6ebab6d4ce55a549f7796c6a6bc4919f`; the authoritative config ETag is `91dbaa8f7c3e3c2262c7444f1a09390a39a41f65c942d2c448c732fcd5b48b0c`.

Next proof remains the existing reserved experiment: journal exact protected baseline and intent, prove desired-zero suppression of crash/cron/rollout/wake, qualified maintenance artifact/restart and child-process identities, actual storage expiry and old-socket drain, then restoration. No service, volume, credential, policy, variable or deployment changed in this preparation.
