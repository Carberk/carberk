# Recovered Play and signing metadata, 2026-10-21

Root recovered the terminal reports from `release897-android-release-input-audit-20261020-r1` and `release897-play-eas-metadata-20261020-r2` through `task_status`. The observations below were made on October 20 against `93f158c367240e3864b924ba36fec49eb3aea7b8`; they are not fresh provider reads or release acceptance. Root verified that `apps/mobile/app.config.js` and `apps/mobile/eas.json` are byte-identical between that source and published `1160d80f378cc65e33954a246b22877e212dd1f6`.

- Production Android package `com.auto_tm.ynamly`, version name 2.0.4. Other profiles default to `tm.auto.app`.
- Public [US-English Play listing](https://play.google.com/store/apps/details?id=com.auto_tm.ynamly&hl=en&gl=US) showed 2.0.4, updated October 15. Live and highest-uploaded Play versionCode remain UNKNOWN.
- At October 20, 12:18-12:22 UTC, read-only EAS commands reported account `tkmdevelopers` and remote production Android versionCode 11. Remote version state and production auto-increment do not establish the next candidate's code.
- Latest production EAS build then was `5824f7e6-ddfa-466d-a238-738ffe02c371`, FINISHED, store distribution, version 2.0.4/code 11. Source `2e1bcb97fff0b7582490b7d5566f067a03f31608`; created October 14 at 08:27:29.201Z and completed at 08:49:46.261Z. It is not an artifact for the campaign candidate.
- Existing artifact retrieval returned an unspecified `HTTPError`. No certificate was inspected and no blind retry followed. The historical SHA-1 prefix `35:AF:4D:C3` remains unverified.
- The available Play Console browser profile redirected to Google's public business landing page. No authenticated Console metadata or credential operation was obtained. Accepted upload certificate, distributed app-signing certificate and current signing capability remain UNKNOWN. Upload and app-signing certificates serve different purposes and must be recorded separately.

No build, signing change, upload or submission occurred. Final merged-SHA artifact provenance, current Play codes, signing/share identities and matching data-safety/disclosures remain release gates. This recovery preserves evidence without repeating provider discovery or introducing another approval gate.

## Read-only Console check, 2026-10-22

Root recovered the completed October21 Console-access and release-gates reconciliation tasks before attempting another browser read. The current Default T3 browser profile still redirects `https://play.google.com/console/developers` to `https://google.play/business/`. A fresh DOM snapshot exposes “Go to Play Console” linking to Google ServiceLogin; no authenticated app metadata loaded. No alternate profile/account, cookie inspection or credential discovery was attempted.

The highest uploaded versionCode across all tracks and both SHA-256 certificate fingerprints remain UNKNOWN. Root requested those nonsecret facts from the founder, or a signed-in Default browser session, through a pending asynchronous question. The existing tab remains available for that handoff. Passwords and signing keys were not requested. Implementation continues independently with the single Codex VIN-correction writer.

Local `apps/mobile/eas.json` still selects remote version state, production auto-increment, store app-bundle distribution and `ANDROID_APPLICATION_ID=com.auto_tm.ynamly`. Local configuration and historical EAS code11 do not prove the current highest Play upload or the eventual artifact's code/signature. No EAS/provider/quota call, build, signing change, track mutation, upload, submission or launch occurred in this check.

## Fresh EAS recovery, 2026-10-23 UTC

The founder directed Root to use the existing Expo EAS deployment records. Installed EAS CLI 24.12.1 authenticated as `tkmdevelopers`. The configured project is `tkmdevelopers/auto-tm`, project id `156dd00b-6192-4467-90ba-1469f7de50fb`. Root inspected production metadata and the credentials summary only. No keystore was downloaded, generated, rotated, exported or reassigned.

| Fact | Fresh observation | Limit |
|---|---|---|
| Production package | `com.auto_tm.ynamly` | Other profiles use `tm.auto.app`; select production explicitly. |
| Latest finished production store build | `5824f7e6-ddfa-466d-a238-738ffe02c371`, version 2.0.4, code 11, source `2e1bcb97fff0b7582490b7d5566f067a03f31608` | Completed October 14 at 08:49:46.261Z; not the #897 candidate. |
| Package-filtered EAS build history | Six records, codes 11, 9, 8, 7, 6 and errored 5 | Highest observed EAS build code is 11. This does not establish the highest uploaded code across all Play tracks. |
| EAS Android credentials | Production default build credentials `HgZsy0eDa6`, JKS | A credentials summary is not a signing-capability test or proof Play accepts this upload certificate. |
| Upload/EAS signing certificate SHA-256 | `03:42:47:59:8E:01:10:F4:F9:13:3D:6A:AC:83:C0:FD:6A:78:BA:4E:4E:E6:7B:6F:77:1A:80:5C:E0:D9:06:D9` | Do not substitute this for Google's Play app-signing certificate. |
| Same certificate SHA-1 | `35:AF:4D:C3:25:75:4B:60:D1:BD:51:52:40:B2:9A:54:EE:18:8C:82` | Matches the historical prefix; does not prove the upload-key reset was accepted. |
| EAS submission list | Empty | Direct Play uploads can exist outside EAS history. No all-track maximum is inferred. |
| Submission service account | None assigned in this EAS app record | Do not search unrelated accounts or credentials. |
| Google Play app-signing SHA-256 | UNKNOWN | Needs authenticated Play metadata or a separately verified distributed artifact. |

The pending `build:version:get` output was not recovered before its terminal session expired. Its result remains UNKNOWN; historical remote code 11 is not promoted to a new remote-version observation. The package-filtered build list independently establishes built code 11 only. Raw build and submission JSON remain private under `/tmp/carberk-resume-20261021/`; they include artifact/log links and must not be copied wholesale into GitHub.

### Repeat the read without changing signing state

From `apps/mobile`, verify `app.config.js` and `eas.json`, then use the installed CLI:

```sh
eas whoami
eas build:list --platform android --app-identifier com.auto_tm.ynamly --limit 50 --json --non-interactive
eas submit:list --platform android --limit 50 --json --non-interactive
eas credentials --platform android
```

For credentials, select `production`, read the displayed certificate summary, then exit at the menu. Do not choose generation, replacement, export or download actions for metadata recovery. For a build list reaching the requested limit, paginate before claiming complete EAS history. Keep upload and Play app-signing identities separate, and record the actual built artifact's code/signature before release. No build, upload, submission, signing mutation or public launch occurred.

Docs: [Android app signing](https://developer.android.com/studio/publish/app-signing), read 2026-10-23, confirms the upload key signs the uploaded bundle and Play App Signing signs APKs for distribution. Exact EAS read flags were checked against the installed CLI's help and successful runtime reads. The Expo credentials documentation request returned HTTP 403 and supplied no evidence.
