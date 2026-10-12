# Documentation lookups

[ADR-0096](../adr/0096-agents-look-up-official-documentation-only-past-their-training-cutoff.md) owns this procedure. Look up external documentation only where your training data cannot know the answer, and read it from official sources. Internal refactors, business logic and reviews need repository evidence, not documentation.

## When a lookup is required

1. Find the version: the lockfile gives the installed version; an upgrade gives the target version.
2. Find its publish date: `npm view <package> time --json`, the entry for that version.
3. Compare it with your training cutoff as your host's model information states it. If you cannot state your cutoff, treat every version as published after it.
4. Published after your cutoff, or an upgrade to such a version: look it up. Published before: no lookup is required. When an API's exact shape matters, read the installed package's type definitions, README or CHANGELOG under `node_modules`, and let typecheck and tests verify the use.

## Where to look

- The project's official documentation for the installed major: a versioned page where one exists, or its `llms.txt`.
- Official release notes, changelogs and migration guides, for example `gh api repos/<owner>/<repo>/releases`.
- Registry metadata for compatibility: `npm view <package>@<version> peerDependencies engines --json`.

Use web search to find these pages, then open and cite the official page. Search summaries, blogs, forum answers and AI-generated wikis are leads, not evidence.

## Dependency upgrades

For each changed package, record the target version and its publish date, the `peerDependencies` and `engines` checked against the rest of the workspace, and the release notes or migration guide followed. Prefer stable releases that have been public for a while over a release published the same week. Mobile packages also follow [mobile/Expo checks](mobile-expo.md); the Expo SDK's bundled versions win over `latest`.

## Evidence

Record one line per external dependency the change relies on in Execution state:

- `Docs: not needed — <package>@<version> published <YYYY-MM-DD>, before cutoff <YYYY-MM>`, or
- `Docs: <official URL> — <what it verified>`.

Internal-only changes record `not applicable`.

## Boundaries

The issue and owning specification define intended behavior; source and runtime evidence establish current behavior. Documentation establishes neither. Use [the context map](../../CONTEXT-MAP.md) to find the owning area and the lockfile for resolved versions.

Mobile dependency and runtime work also follows [mobile/Expo checks](mobile-expo.md); styling and data fetching follow [NativeWind](nativewind-v4.md) and [mobile data fetching](mobile-data-fetching.md). [Verification](../../.claude/skills/run-issue/VERIFICATION.md) owns evidence requirements.
