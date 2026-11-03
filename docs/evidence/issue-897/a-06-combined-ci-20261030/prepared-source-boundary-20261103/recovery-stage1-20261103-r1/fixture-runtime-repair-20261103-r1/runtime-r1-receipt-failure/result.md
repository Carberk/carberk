# Focused stage attempt 1, receipt-reader failure

The repaired source executed all seven exact cases successfully with `maxWorkers=1`, zero skips, no `42501`, no `prisma_close`, and zero database/role/S3/Redis/resource residuals. The existing receipt reader exited 1 because passing Vitest 5.0.4 tests buffered `console.info`, leaving zero `938_cleanup_receipt` markers in stage stdout. This attempt is preserved as a packet-output failure, not a source failure. The bounded packet correction added `--disableConsoleIntercept` for the rerun.
