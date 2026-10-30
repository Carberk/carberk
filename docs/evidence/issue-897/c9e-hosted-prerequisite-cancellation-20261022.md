# c9e hosted prerequisite cancellation

Exact published candidate `c9e80cb88f513321b6c7a6f65b6dacd95cd873ba`, PR Checks run [39850814451](https://github.com/Carberk/carberk/actions/runs/39850814451), is terminal CANCELLED. API job `120076287802` is CANCELLED; aggregate `pr` job `120091075196` is FAILURE. Lane/static/frontend/database succeeded, docs skipped, and the separate runtime check succeeded.

The API job started at 20:40:21 UTC. Pinned codec installation ran 20:40:54 through 21:10:13, **29m19s**, and succeeded. Disposable-service startup ran 21:10:13 through 21:10:29 and was canceled. Dependency installation, migration and `pnpm test:api` were SKIPPED. The workflow retains its 30-minute API job limit. No Root cancellation or rerun was issued. **No API or worker test result exists on this candidate**, including the changed consumed-erasure oracle. Previously reported c1fa HTTP results remain evidence for that earlier candidate only.

The completed database job `120076287639` actually executed **392/392 tests, 41/41 files PASS**. Root downloaded both terminal logs, rather than inferring counts from a check conclusion.

| Raw artifact under `/tmp/carberk-resume-20261021/` | SHA256 |
| --- | --- |
| `c9e-api.log` | `2aa750a247d4a302746d4118c5ef6d3b09aaaf22bad4aaf3c01d388007eb5719` |
| `c9e-db.log` | `86dd05e4bebffea9d5be563bc8f48fe04a63bfa7ad9cc48911fcbd84c7086c09` |

The API trace records Ubuntu archive download retries against `http://azure.archive.ubuntu.com/ubuntu` for libsvtav1enc1d1, libavcodec60, libflite1, libmysofa1 and ffmpeg. Apt reports 48.6 MB fetched in 28m47s at 28.1 kB/s. This establishes a slow prerequisite in this run; it does not establish a tested mirror/cache/network fix. The earlier 9e codec delay is separately preserved. Root has no tight Ubuntu/Azure reproduction on this macOS host and claims no completed causal diagnosis or speculative CI repair. Codec version, budgets and test coverage stay unchanged.

The [inspected corrected-mixed source batch](corrected-mixed-assembly-20261022.md), including fresh Root 105/105 continuity proof and four collected HTTP journeys, can now be published through the normal fast-forward integration branch. This is a new source candidate with its own required hosted gate, not a rerun or inherited GREEN. The sole public-transfer Codex writer is independent and still running from the inspected local batch. Root remains sole assembler; no second writer, environment reset, deployment, merge, promotion, store submission or public launch occurred.

Docs: terminal CI/log inspection only. No external dependency/service API changed; no artificial behavior test is needed for this receipt.
