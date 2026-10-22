# Public lineage cancelled CI receipt, 2026-10-22

This receipt records the terminal result for the exact published candidate `c2d681bcc84ced709208985796b26f0993125925`, tree `eeba40cb1928be8d7e295ef708cda73ec3e777eb`, in integration PR #904.

## Run result

- PR Checks run: `39870448703`
- API job: `120143325762`
- API job started at `2026-10-22T23:14:31Z` and ended at `2026-10-22T23:44:50Z` with conclusion `cancelled`.
- The job reached the real `Run pnpm test:api` step. Its captured worker portion reported `57 passed` files and `373 passed` tests, then the operation was cancelled before a completed API suite summary. The log ends with `The operation was canceled.`
- Lane, static, frontend and DB jobs passed. Docs was skipped. The aggregate PR run was cancelled and the `pr` lane then failed because a required job did not complete.
- Raw API log: `/tmp/carberk-resume-20261021/c2d-api-cancelled-direct.log`
- Raw log SHA-256: `c6fa780cccf6b554bf0862953f890d4de574e9cb990b52a94b1bfdd6b9e95928`

No cancellation actor is identified in the job log. Root did not cancel, rerun, alter timeout/budget, weaken assertions or change CI policy. This run supplies no completed API behavioral verdict and cannot certify the public lineage or PDF lifecycle suites.

## Next candidate

The next local candidate is `5477644b19a78163473ddd9fc12c986d401f27fc`, tree `de2110dcaaf992d65feade8bf14b46a4333e44e9`. It adds the test-first all-locale PDF recovery RED checkpoint. The next publication also includes this receipt and the bounded ownership review record as a following documentation commit. Publication waits until the preceding run is terminal.

No production PDF architecture, automatic ownership architecture, reset, deployment, merge, promotion or store action was selected by this receipt.
