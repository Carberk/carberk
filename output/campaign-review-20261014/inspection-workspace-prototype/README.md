# Carberk inspection workspace prototype

Open `index.html` directly. It is one self-contained HTML file with embedded fonts, diagrams, styles and fictional data. No server, package install or account is needed to use it. Refreshing resets all changes.

The prototype explores whether reception, technician, reviewer and checklist-manager workflows fit together without losing report scope, historical versions or private audiences. It is a review artifact, not production staff software.

## Start here

1. Open Guided walkthroughs.
2. Start Dealer public report.
3. Use Do this step to progress. Every step performs actual prototype actions.
4. Use Previous step to reconstruct the prior state, or Exit guide to explore freely.
5. Try Buyer A and Buyer B to inspect the private-report boundary.

Six walkthroughs cover the public report, private buyer audience, reviewer return, checklist version change, correction/reinspection, and access removal/no-show. All roles can be selected from Acting as. The current state inspector records the role, selected order, template version, draft completeness and snapshot count.

## Working screens

- Appointments and inspections: create requests, edit intake, confirm manually, record arrival, cancel/no-show with reason, start an assigned inspection.
- Intake: vehicle identity, date/mileage, commissioner, report audience, owner physical-access authorization, public-publication permission, listing match, scope acknowledgment and sample at-center payment status.
- Checklist: 36 draft Turkmen checks with descriptions, explicit results, notes, local sample images and missing-evidence explanations. A new inspection pins the published template. No automatic Normal defaults.
- Body map: five original generic sedan views, named panel hotspots and an equivalent panel list, explicit assessments, stable numbered findings, separate current-damage/repair-evidence/history types, measurements/units/methods, attributed sources and photos.
- Review: completeness list, full draft preview, return reason, role separation, final immutable content snapshot.
- Delivery: private/public recipient simulations, all findings and scope limits, masked demo identity, PDF pending/failure/retry/ready, printable snapshot reader. Phone selects one large view; desktop/print show all views.
- History: complete snapshot list, correction successor preserving original observation date and audience, reinspection through renewed appointment/authorization/arrival with empty results, and withdrawal with reason.
- Checklist manager: clone published version, edit titles/sections/instructions, add/remove checks, request evidence and publish for future starts only.

## Limits and proposals

Everything is fictional and lives in browser memory. Roles, permission removal, recipient access, artifact generation and at-center payment are simulations. Browser source contains the fictional private data. It is not an authorization implementation. Do not enter real customer or vehicle information.

Separate reviewer, completeness requirements, handling of absent evidence, withdrawal and historical-version display are prototype assumptions requiring operating decisions. The 36 checks are mechanic-review content, not an approved service promise. Price, duration, equipment, staff identity/elevation, refunds, retention, VIN matching/masking and freshness rules remain open. No private-to-public conversion, ranking boost, payment processing, traveling inspector or extra service tier is introduced.

Browser Print / Save demo PDF uses the selected finalized snapshot. It is not a server-generated issued artifact. The static reviewed report/PDF design samples are separate; clicking Ready simulates a generation job and does not generate a stored PDF. Browser print pagination, printer dialog and all-locale output remain unverified. No API, upload storage, session security, real notification delivery, restart recovery or native integration exists.

## Source and rebuild

`app.js` owns the in-memory reducer and throwaway UI. `style.css` follows the native Carberk theme and components. `checklist-source.json` preserves the earlier 36-item Turkmen review input. `shell.html` and `build.py` generate the self-contained file. The builder imports the existing original diagrams in `output/report-design/vehicle.py` and embeds the licensed bundled mobile fonts and Carberk logo.

From the repository root, rebuild using a Python environment with reportlab, for example:

```sh
/tmp/carberk-pdf-venv/bin/python output/inspection-workspace-prototype/build.py
```

This command only builds HTML; it does not create or change a PDF. The generated HTML runs independently of the builder. Embedded Geist fonts use the license in `apps/mobile/assets/fonts/Geist-OFL.txt`.

A local HTTP URL with `?guide=public` opens the public guided path immediately. Other guide IDs are `private`, `returned`, `template`, `correction` and `access`.
