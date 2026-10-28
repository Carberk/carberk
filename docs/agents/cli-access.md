# Existing Railway and EAS access

Use the host's existing Railway and EAS CLI sessions for authorized infrastructure, build and signing work. Missing token environment variables do not establish missing access. A new worktree does not require a new account, project token or signing key.

## Resolve the actual access path

1. Resolve the installed binary with `command -v railway` or `command -v eas`; check its version and relevant `--help`. Historical receipts can name an older binary. Prefer the authenticated binary that supports the required flags; set a helper's CLI override when necessary.
2. Check `railway whoami --json` or `eas whoami`. Keep identity output out of public evidence. If authentication succeeds, continue under the task's existing authority without asking for a token or repeated permission.
3. Resolve the intended project/account and environment. Railway worktrees may lack linked context: use known project/environment/service IDs and explicit flags rather than treating an unlinked directory as an authentication failure. For EAS, run from `apps/mobile` and inspect the checked-in project configuration and `eas.json` profile before a build.
4. Run the authorized operation through that CLI session. A helper's absent `STAGING_RAILWAY_PROJECT_TOKEN`, `RAILWAY_TOKEN`, `RAILWAY_API_TOKEN` or `EXPO_TOKEN` is not a reason to request a new secret when the equivalent operation supports the existing login.

Authentication establishes access, not task scope. Follow recorded founder authority, [delivery gates](coding-workflow.md), [deployment procedures](../prd/ops/80-deployment-runbook.md) and [shared-resource reservations](shared-staging.md). The coordinator handles routine prerequisite and resource choices under [delegation authority](coding-workflow.md#delegation-authority).

## Railway

`railway status --json` inspects linked context when no explicit target is supplied. For an explicitly supplied target, resolve and use its IDs instead of trusting another checkout's link. Read the installed command's help for supported project/environment/service options. A successful account identity check does not by itself prove access to every target.

Inspect credential-source **presence only** when diagnosing a failed login. A stale or narrower token override, a wrong target, an outdated binary and an expired user session are different failures. Where supported, select the existing user-login session in a command-scoped process instead of an inapplicable token override; preserve agent-identification and safety controls. Keep shared authentication/configuration intact. Serialize any necessary login repair with the coordinator so two agents do not replace the same session.

Prefer a supported CLI operation over an unnecessarily token-only helper. Never extract a token from the CLI credential store, print raw variable/configuration listings or ask the founder to paste a token into chat. Capture secret-bearing output internally and report only required metadata or pass/fail. An actual host guard refusal is binding; report it without retrying through another transport. An ordinary API authorization error needs diagnosis of identity, target and scope rather than an automatic token request.

## EAS builds and signing

Use `eas whoami` and the existing project's managed credentials. Inspect build/profile metadata with commands supported by the installed CLI, such as `eas build:list` and `eas build:version:get --platform android --profile production --json`. Use `eas credentials --platform android` to inspect the selected project's credential configuration; it is an interactive management command, so choose existing credentials and preserve keys. Do not generate, rotate, replace or export signing material merely to inspect it or build with it.

Use the profile in `apps/mobile/eas.json` and its configured credential source. A noninteractive build should use existing configured credentials. If it fails, diagnose the exact project/profile/account or missing credential rather than asking the founder to supply a keystore again. The coordinator resolves routine prompts covered by existing authority; public submission remains a separate action.

EAS upload-key metadata, Google Play app-signing certificates and version history across Play tracks describe different facts. Report what each source proves. Prepare and verify the internal artifact using available EAS evidence; retain any genuinely Play-only submission criterion for its proper release gate instead of blocking internal candidate work on a new token request.

## Escalation

Child agents send access failures to Chief of Staff through agent messaging. The coordinator checks the existing CLI session, binary, target and relevant override names first, continues independent work, and requests founder help only for a genuinely unavailable external grant, expired login requiring a person, hardware access or action beyond delegated authority. Name the exact failed operation/error and the smallest missing access. If a new secret is truly necessary for an authorized token-only integration, use the host's private secret-entry mechanism; never collect it in chat or commit it.

References: [Railway CLI](https://docs.railway.com/guides/cli), [EAS managed credentials](https://docs.expo.dev/app-signing/managed-credentials/), [Expo app credentials](https://docs.expo.dev/app-signing/app-credentials/). Installed CLI help owns supported local flags; live identity and target checks own current access claims.
