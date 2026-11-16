# Roadmap

Founder-approved scheduling context only. Current delivery scope and status live in [GitHub issues](https://github.com/Carberk/carberk/issues); source, tests and runtime evidence establish what ships. [ADR-0109](../adr/0109-source-first-documentation-and-design-workflow.md) replaces sprint planning and progress logs with Now / Next / Later priorities.

## Now

- Continue approved small-PR delivery through the [repository improvement graph #1285](https://github.com/Carberk/carberk/issues/1285), [native dual-entry gateway #1153](https://github.com/Carberk/carberk/issues/1153), and [Vehicle History #1174](https://github.com/Carberk/carberk/issues/1174). Their issues own dependencies and acceptance; they do not authorize live service activation or production operations.
- Keep Google Play reviewer readiness separate from real-user rollout. The [reviewer release map #320](https://github.com/Carberk/carberk/issues/320) records that delivery; current release procedures are in the [Play submission pack](ops/88-play-console-submission.md). Android-first sequencing does not remove iOS from the product.
- Add a small reliability and measurement foundation before or alongside Listing video, then instrument each feature as it is built. Prove actionable error/health alerts and core product-outcome visibility before real users; expand the Improvement workspace incrementally ([ADR-0109](../adr/0109-source-first-documentation-and-design-workflow.md#measurement-and-maintenance)).

## Next

- Admit real users only through the [launch plan's invited-pilot gates](ops/84-launch-plan.md#invited-pilot-checklist-and-expansion): begin with 20 invited Aşgabat users, review after at least two weeks and the stated supply/contact evidence, then consider up to 50 before a separately gated Mary pilot. Founder authorizes each invitation/expansion step.
- Trust remains the differentiator ([ADR-0037](../adr/0037-trust-inspection-competitive-wedge.md)). App-pilot readiness is independent of the manual inspection experiment ([ADR-0101](../adr/0101-app-pilot-separate-from-manual-inspections.md)). Dealer workspaces are free under [ADR-0103](../adr/0103-free-dealer-business-ownership-and-enquiries.md); actual diagnostic service activation requires the center, staff, consent and operational readiness in [ADR-0104](../adr/0104-center-diagnostics-with-private-and-public-reports.md). Neither software delivery nor a synthetic sample establishes a live service.
- Hosting/cutover, real sign-in delivery, disclosures, monitoring, support and restore evidence remain release gates in the [launch plan](ops/84-launch-plan.md) and [deployment runbook](ops/80-deployment-runbook.md). The current gateway proposal owns its requested hosting changes; scheduling here does not amend accepted hosting decisions.

## Later

Choose further bets from observed marketplace needs, not a fixed sprint roster. Existing candidates remain deferred unless a current approved issue admits them: better discovery/free-text search and saved searches; Garage and Bortzhurnal/owner reviews; public web expansion; broader admin/moderation, notification and advertising capabilities; inspection/PDF workflows, orbit media and comparisons. Paid placement remains excluded. Inspection quality tiers are superseded by complete dated findings under ADR-0104.

Cars prove the marketplace loop first. Trucks/commercial, auto parts, specialized parts-compatibility matching and services remain separately shaped expansion bets under [ADR-0035](../adr/0035-multi-vertical-platform-direction.md); multi-category breadth is not the trust differentiator. Wider public launch, iOS submission and TM-era app/update delivery retain their separate readiness and human release gates in the launch plan.

Priority changes belong to the founder. Use the [delivery workflow](../agents/coding-workflow.md) for one issue and one coherent PR; keep completion evidence in its PR and issue. Historical sprint plans and progress remain in Git history.
