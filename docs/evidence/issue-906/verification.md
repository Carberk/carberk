# Issue 906 evidence

Reserved from assembled base `709e10c989ad82703ba8dd7067b9fa42393a53af` on `agent/issue-906`. Writer owns admin global shell/localization/auth bridge and bounded context read ports. No shared schema/contracts/identity changes while #902 owns them. Existing approved admin/service workspace contracts govern the extension of incumbent UI.

Red checkpoint `539d401f`: after building the missing generated contracts artifact, `pnpm --filter @auto-tm/admin exec vitest run src/app/actions.spec.ts` produced one genuine behavioral failure and ten passes. Current scoped non-admin eligibility was rejected by the old role-only sign-in gate. The initial command before that build had dependency-resolution failures and is not behavioral evidence. Red log `/tmp/carberk-906-auth-red.log`.
