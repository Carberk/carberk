# Hosted Support text verification, 2026-10-21

Exact candidate `bf2dbc57427ac2690804e651a47438ddaa6c9f4d`, tree `7a23a9a9b88a30af2f048547f6c437dcec98a54c`, main `9fde309c3da17f2661fe9c266504e6e56a1b97c9`.

[PR Checks 39526808531](https://github.com/Carberk/carberk/actions/runs/39526808531) completed SUCCESS. Lane, DB, API, static, frontend and required `pr` jobs succeeded; docs was skipped. [Runtime 39526808515](https://github.com/Carberk/carberk/actions/runs/39526808515) completed SUCCESS on the same SHA.

API job `118983355041` reports 315/315 files and 3046/3046 tests passed. Worker reports 54/54 files and 356/356 tests passed. `CampaignFullV3.e2e.spec.ts` passed all 26 cases, including the previously failing Support text journey.

The named Support case proves its ordinary open, text/private-note/read-state, idempotency/privacy, foreign-reservation preservation, retained redacted audit and repeatable-reset assertions on this SHA. Original authentication/business, coordinator, contact, draft and sender/reset cases also passed. Source and test scope are in the [assembly receipt](support-assembly-and-media-disposition-20261021.md) and [Support handoff](../issue-901/full-v3-support-text-source-20261021.md).

Root downloaded the complete API log once. Host-local files are `/tmp/carberk-next-release-20261021/bf2dbc57-api.{raw,plain}.log`; plain lines 1572–1573 contain worker totals, 2431–2456 the full-v3 outcomes, and 2459–2460 API totals. These temporary logs supplement the linked hosted run and this committed receipt.

This receipt does not certify later SHAs. The subsequently pushed `0101654d` adds one media/publication/removal/object-disposal case, for 27 declarations; its hosted result is separate. Full graph/roster, Support commands/queue/attachments/push/worker races, History, diagnostics, measurement, operational v3 admission, final independent review, native/browser/deployed/ops acceptance, restoration and signing/disclosure gates remain incomplete. No release, merge or activation approval follows from these passing checks.
