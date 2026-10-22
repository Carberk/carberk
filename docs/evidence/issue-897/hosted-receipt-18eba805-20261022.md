# Hosted acceptance at 18eba805

The exact candidate is `18eba80587af2190a443e3aa522f24b12a64b2d9`, tree `915e05369d37f72d9c430d7af881db1afa78560f`. Root recovered its terminal results before publishing the next test-only checkpoint. These results certify only this SHA.

[PR Checks 39763280137](https://github.com/Carberk/carberk/actions/runs/39763280137) completed FAILURE. Lane, static, DB and frontend passed; docs skipped; API and aggregate pr failed. [Image runtime 39763280273](https://github.com/Carberk/carberk/actions/runs/39763280273) passed. PR #904 remains draft with auto-merge disabled.

| Acceptance | Exact evidence | Result |
| --- | --- | --- |
| Bounded private automatic normalized VIN | API job119772559865, `DiagnosticAutomaticVinProof.e2e.spec.ts`, one case, 3343ms | PASS. Ordinary capture/release/comparison/material precede issuance, restricted read and consumption/retry. This completes the bounded positive that failed at issuance on5361851d. |
| Existing comparative proof security, atomicity and lifecycle | Same API job, `DiagnosticContinuityProofIssuance.e2e.spec.ts`, 99 cases, 211567ms | PASS |
| Worker | Same API lane, 57 files, 373 tests | PASS |
| Database | DB job119772559834, 41 files, 392 tests | PASS |
| Full API | 324 passed files, one failed file; 3201 passed tests, three failed tests | FAIL, only the three protected reset tails below |
| Consumed private-link real-worker expiry | Not present in this candidate | UNKNOWN; next test checkpoint |

The three failures remain in `CampaignFullV3.e2e.spec.ts`. Support's selected-worker barrier is not observed within the existing lock budget at helper2120/case2299. The reset transport reports cleaning SQLSTATE55P03, starting1433.202267ms and ending6515.102611ms. Publish and attach cases fail the suspended-PUT assertion at3288. Later ordering/no-resurrection assertions remain unreached. No deadline, retry, assertion or skip was changed; successful unrelated diagnostics do not prove those product tails.

Raw logs are retained under `/tmp/carberk-resume-20261021`:

- `18eba805-api-119772559865.raw.log`, SHA256 `0bb71103279cc43011169f72f9a95dd548365d19aa46c7273c3feab7b33f8f16`.
- `18eba805-db-119772559834.raw.log`, SHA256 `93b318d094c644cd89bac12b3042e394da5b098f6b82e300023ca45a123710c3`.

The CLI initially refused raw terminal escapes; its explicit output flag then saved the logs to files. This was an output-format refusal, not a host authorization guard. No rerun, dispatch, polling loop, service, Railway operation or reset occurred.
