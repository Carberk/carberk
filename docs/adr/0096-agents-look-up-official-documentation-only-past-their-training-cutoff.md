# ADR-0096: Agents look up official documentation only past their training cutoff

- **Status**: Accepted
- **Date**: 2026-10-12
- **Deciders**: AutoTM founder
- **Supersedes**: [ADR-0017](0017-context7-as-canonical-doc-source.md), [ADR-0068](0068-resolve-context7-ids-at-lookup-time.md)
- **Amends**: [ADR-0059](0059-kimi-code-as-a-third-interactive-coding-agent.md)'s requirement that a Kimi session has Context7 access

## Context

ADR-0017 made Context7 the canonical source for external library documentation and required a lookup before any code that touches a dependency, "even when they believe they already know the answer". ADR-0068 added a library-ID resolution before every query, so each lookup costs two calls, and implementers and reviewers repeat them.

Context7's free plan allows 1,000 calls a month, then blocks the account apart from 20 calls a day; Pro costs $10 per seat a month. Batch 5 exhausted the monthly quota mid-verification and fell back to official documentation ([evidence](../evidence/batch-5/verification.md)). The founder will not pay for the service.

The risk ADR-0017 addressed is real but concentrated: a model knows nothing released after its training cutoff. The October 2026 toolchain review showed it. TypeScript 7.0 (July 2026) ships no compiler API, pnpm 12 shipped in August 2026, and GitHub removed Node 20 from its runners in September 2026, all after the reviewing model's June 2026 cutoff. Each would have produced a wrong upgrade plan without a lookup. Releases before the cutoff are in the model's training data, and the installed package's own types and changelog are on disk.

Every agent host can fetch web pages, and the npm registry records when each version was published (`npm view <package> time --json`), so whether a version predates a cutoff can be checked without a paid service.

## Decision

**Agents look up external documentation only for releases published after their training cutoff, and read it from official sources, using web search to find them. Context7 is no longer used or required.**

- **When.** A lookup is required when the dependency version a change relies on, installed or targeted, was published after the agent's training cutoff. The lockfile gives the installed version and `npm view <package> time --json` its publish date. Every upgrade to a post-cutoff version therefore includes reading its release notes and migration guide. An agent that cannot state its cutoff from its host's model information treats every version as post-cutoff.
- **Before the cutoff.** No documentation lookup is required. When an API's exact shape matters, the installed package under `node_modules` (type definitions, README, CHANGELOG) is the evidence, and typecheck and tests verify the use.
- **Where.** Official sources only: the project's documentation for the installed major (a versioned page, or `llms.txt` where published), its release notes, changelog and migration guides, and registry metadata for compatibility. Web search finds these pages. Search summaries, blogs and AI-generated wikis are leads, never evidence.
- **Compatibility.** A dependency upgrade records, for each changed package, the registry `peerDependencies` and `engines` it was checked against and the official release notes it follows.
- **Evidence.** Execution state records either `Docs: not needed — <package>@<version> published <date>, before cutoff <month>` or each official URL read and what it verified.
- **Tools.** The repository grants and configures no documentation MCP server; agent definitions grant web search and web fetch instead.

## Consequences

### Positive

- No paid service, no monthly quota, and no MCP server to configure in each host.
- Lookups happen where models lack the facts: new releases and version changes.
- Evidence cites primary sources a reviewer can open.
- Upgrade compatibility rests on registry metadata, which is exact and free.

### Negative / accepted costs

- A mandatory lookup no longer prevents pre-cutoff version mix-ups, such as ADR-0017's TanStack Query v4 calls against v5. Typecheck against installed types, tests and review must catch them; a reviewer may ask for a lookup.
- Hosts that do not state the model's cutoff lose the shortcut and look up every time.
- Web search can surface stale or wrong pages; agents must open and cite the official page.
- Whether the `claude-kimi` host provides web search is unverified; it can still fetch known official URLs.

### Neutral

- Merged ADRs and historical evidence that cite Context7 IDs stay unchanged. The index marks ADR-0017 and ADR-0068 as superseded.
- Anyone may still use another documentation tool privately; it counts as evidence only through the official source it cites.

## Alternatives considered

- **Context7 Pro at $10 per seat a month.** Rejected by the founder on cost.
- **Keep Context7's free plan and the existing rule.** Rejected: mandatory resolve-and-query exhausts 1,000 monthly calls, as batch 5 showed.
- **Other documentation MCP servers (DeepWiki, GitMCP, Expo MCP, a self-hosted index).** Rejected as requirements. DeepWiki answers from AI-generated wikis, not official docs. GitMCP and the Expo MCP add a server for pages web fetch already reads, and Expo's documentation search needs a paid EAS plan. A self-hosted index needs maintenance. Any of them may still be used as a lead.
- **Look up every external API through web search, regardless of cutoff.** Rejected: it re-reads documentation the model already holds and the installed types already prove.

## References

- [ADR-0017](0017-context7-as-canonical-doc-source.md), [ADR-0068](0068-resolve-context7-ids-at-lookup-time.md), [ADR-0059](0059-kimi-code-as-a-third-interactive-coding-agent.md)
- [Documentation lookups](../agents/documentation-lookups.md)
- [Batch 5 verification evidence](../evidence/batch-5/verification.md), Context7 monthly quota exhausted
- [Context7 plans](https://context7.com/plans), checked 2026-10-12
- [`npm view`](https://docs.npmjs.com/cli/commands/npm-view)
