# #938 bounded fixture runtime repair, offline handoff

Base executor source: `045f249ef9d44bb72cf8d390cc9a31911c6d7985`, source-equal to `94ad0134a5d5ec03beb70a69746054637f0e937b` outside docs.

Allowed source changes:

- `apps/api/test/helpers/diagnosticPreparedReaderFixture.ts`: add `UPDATE` to the existing restricted-role `measurement_state` grant; skip a second explicit Prisma close when Nest app/module shutdown owns that lifecycle, retaining the explicit close only for pre-module partial initialization.
- `apps/api/src/modules/identity/presentation/DiagnosticScopedDiscovery.e2e.spec.ts`: retain the `P0001` and `diagnostic_identity_evidence_immutable` cause under Prisma 7's `DriverAdapterError` shape.

Checks ran serially from the executor:

- `pnpm --filter @auto-tm/api typecheck`
- `pnpm --filter @auto-tm/api exec tsc6 --noEmit`
- `pnpm --filter @auto-tm/api lint`
- `pnpm --filter @auto-tm/api build`
- `git diff --check`

All exited 0. No package installation, service, database, runtime, hosted, native or PR command ran.
