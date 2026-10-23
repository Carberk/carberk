# Named staff bootstrap

This command provisions an exact existing verified User with one explicit purpose capability. It changes no marketplace role, bypasses no TOTP and sends no invitation. Normal grants/revocations use current elevated `staff.manage` authority with audit through Identity. Founder-controlled grants require `founder.control`; HTTP cannot grant that root capability. This operator command is the explicit bootstrap and recovery boundary, never an automatic seed, deployment hook or API fallback.

Before an authorized operator runs it, confirm the exact environment, User ID, duty/capability and reason. Keep the identity purpose/assignment policy separate from Dealership membership. Review a dry run first:

```sh
pnpm --filter @auto-tm/db staff:bootstrap --user-id <exact-user-uuid> --capability <named-capability> --reason '<why this named person needs this duty>' --dry-run
```

Run the same command without `--dry-run` only under the operator's existing environment authorization. Missing, unverified, suspended or deleting Users fail closed. Unknown capabilities and empty/oversized reasons fail validation. Already-active grants are a no-op. A grant or reactivation and `STAFF_CAPABILITY_BOOTSTRAP` audit with null system actor, exact target, capability and reason commit atomically. No credential values enter the audit. Founder initial provisioning needs each explicit capability, including `staff.manage` for named changes and `founder.control` for founder-controlled authority; neither is inferred from `role=admin`.

The supported capability allowlist lives in `packages/contracts/src/schemas/staff.ts` and the database check constraint. `founder.admission` and `founder.recovery` authorize downstream evaluation only; they do not bypass that feature's controls or perform infrastructure changes. Private service/diagnostic/analytics records require their owning assignment, audience, reason and audit policies in addition to current session/capability/elevation. Provisioning code does not establish activation readiness or approve live onboarding.
