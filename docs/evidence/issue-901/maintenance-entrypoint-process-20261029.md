# Local maintenance entrypoint process proof

Coordinator functional experiment at `2f1571730b52163f0019d67aa7f5d74a9a525232`, before staff-only assembly. `pnpm --filter @auto-tm/api build` passed. The actual compiled `apps/api/dist/src/main.js` ran twice under local Node `v22.22.2` with an allowlisted environment containing no database, Redis or storage credentials. No provider, database, queue or storage service was contacted. This proves local artifact behavior, not Railway execution exclusion or reset admission authority.

Both starts used the same synthetic staging binding, candidate and port. The first process was killed with SIGKILL; a new process ran the same artifact and binding, then stopped with SIGTERM. On each start:

- `/healthz` identified the candidate; `/readyz` reported maintenance with `businessReady:false`.
- Sign-in, upload presign, operator/reset, listing and Socket.IO polling requests returned 503.
- A read-only module-cache snapshot contained only `main.js` and the maintenance server from the application. Nest, AppModule, Prisma, BullMQ, Redis and Socket.IO business packages were absent.
- A process-tree snapshot found no child processes. Both process IDs were confirmed absent after termination.

Four additional child starts tested a production environment, candidate mismatch, absent maintenance flag and malformed binding. All exited with code 1 and `Reset executor admission refused`; no listener survived. The harness ended with zero children.

The [machine receipt](maintenance-entrypoint-process-20261029.json) pins source, artifact, audit and driver hashes. Reproduction artifacts remain under `/tmp/issue901-maintenance-entrypoint-20261029/`: `run.cjs`, `audit.cjs`, private module-cache snapshots and `receipt.json`. The audit reads the module cache; it does not replace application modules. Application source was unchanged.

The second start is a controlled local restart, not an observed provider restart. Module-cache and process-tree snapshots are bounded observations, supported by the entrypoint's pre-import maintenance branch. The local Node patch differs from the configured artifact environment. Railway deployment environment-snapshot semantics, old-deployment exclusion, automatic crash/cron/rollout/wake behavior, remote process epochs, actual signed-grant expiry and storage socket drain remain unproven. The binding validates shape and target consistency; this experiment gives it no durable operation authority. Reset activation remains closed.
