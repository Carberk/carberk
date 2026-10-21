# Recovered Play and signing metadata, 2026-10-21

Root recovered the terminal reports from `release897-android-release-input-audit-20261020-r1` and `release897-play-eas-metadata-20261020-r2` through `task_status`. The observations below were made on October 20 against `93f158c367240e3864b924ba36fec49eb3aea7b8`; they are not fresh provider reads or release acceptance. Root verified that `apps/mobile/app.config.js` and `apps/mobile/eas.json` are byte-identical between that source and published `1160d80f378cc65e33954a246b22877e212dd1f6`.

- Production Android package `com.auto_tm.ynamly`, version name 2.0.4. Other profiles default to `tm.auto.app`.
- Public [US-English Play listing](https://play.google.com/store/apps/details?id=com.auto_tm.ynamly&hl=en&gl=US) showed 2.0.4, updated October 15. Live and highest-uploaded Play versionCode remain UNKNOWN.
- At October 20, 12:18-12:22 UTC, read-only EAS commands reported account `tkmdevelopers` and remote production Android versionCode 11. Remote version state and production auto-increment do not establish the next candidate's code.
- Latest production EAS build then was `5824f7e6-ddfa-466d-a238-738ffe02c371`, FINISHED, store distribution, version 2.0.4/code 11. Source `2e1bcb97fff0b7582490b7d5566f067a03f31608`; created October 14 at 08:27:29.201Z and completed at 08:49:46.261Z. It is not an artifact for the campaign candidate.
- Existing artifact retrieval returned an unspecified `HTTPError`. No certificate was inspected and no blind retry followed. The historical SHA-1 prefix `35:AF:4D:C3` remains unverified.
- The available Play Console browser profile redirected to Google's public business landing page. No authenticated Console metadata or credential operation was obtained. Accepted upload certificate, distributed app-signing certificate and current signing capability remain UNKNOWN. Upload and app-signing certificates serve different purposes and must be recorded separately.

No build, signing change, upload or submission occurred. Final merged-SHA artifact provenance, current Play codes, signing/share identities and matching data-safety/disclosures remain release gates. This recovery preserves evidence without repeating provider discovery or introducing another approval gate.
