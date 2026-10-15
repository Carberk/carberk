import { createHash } from 'node:crypto';

const sha = (value) => /^[a-f0-9]{40}$/.test(value ?? '');
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const empty = () => ({ version: 1, queue: [], reservation: null, history: [] });
function validPolicy(p) {
  if (p.environmentName !== 'staging' || !p.projectId || !p.environmentId ||
      !p.services?.api || !p.services?.worker || p.credentialScope !== `project:${p.projectId}:${p.environmentId}`) throw new Error('Staging identity or credential scope refused');
  if (Object.keys(p.services).some((k) => !['api', 'worker', 'admin', 'web'].includes(k))) throw new Error('Unknown staging service');
  for (const key of ['database', 'media', 'publicMedia', 'api']) {
    let url; try { url = new URL(p.origins[key]); } catch { throw new Error('Explicit staging origins required'); }
    if (url.username || url.password || url.search || url.hash) throw new Error('Origins must contain no credentials or overrides');
    if ((key === 'database' && (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== 'postgres.railway.internal')) ||
        (key === 'media' && (url.protocol !== 'http:' || url.hostname !== 'minio.railway.internal')) ||
        (['publicMedia', 'api'].includes(key) && url.protocol !== 'https:')) throw new Error('Staging data/media origins refused');
  }
}

/** Operations retain durable ownership until verified restoration. No timeout or force-unlock. */
export class StagingControl {
  constructor(dependencies) { Object.assign(this, dependencies); validPolicy(this.policy); }
  async inspect() { return (await this.ledger.read()).state ?? empty(); }
  async write(snapshot, next) {
    if (!await this.ledger.compareAndSwap(snapshot.revision, next)) throw new Error('Reservation changed or persistence uncertain; inspect before retry');
  }
  async attest() {
    let actual; try { actual = await this.platform.attest(this.policy); } catch { throw new Error('Authoritative staging attestation unavailable'); }
    validPolicy(actual);
    if (digest(actual) !== digest(this.policy)) throw new Error('Authoritative staging identity or origins mismatch');
    return actual;
  }
  async enqueue(request) {
    if (!sha(request.candidate) || !Number.isSafeInteger(request.parent) || request.parent < 1 ||
        !Number.isSafeInteger(request.pr) || request.pr < 1 || !Number.isSafeInteger(request.priority) || request.priority < 0 ||
        !/^https:\/\/github\.com\/bagtyyarkovusov\/auto\.tm-rewrite\/(issues|pull)\/[1-9]\d*(#.*)?$/.test(request.priorityEvidence ?? '')) throw new Error('Invalid reservation request');
    const id = this.id(); if (!/^[a-f0-9]{32}$/.test(id)) throw new Error('Invalid reservation ID');
    const snapshot = await this.ledger.read(); const state = snapshot.state ?? empty();
    state.queue.push({ ...request, id, owner: this.actor, readyAt: this.now(), identity: this.policy });
    await this.write(snapshot, state); return id;
  }
  async acquire(id) {
    const identity = await this.attest();
    const snapshot = await this.ledger.read(); const state = snapshot.state ?? empty();
    if (state.reservation) throw new Error('Staging already reserved; inspect recovery state');
    // Stable stored insertion order breaks equal timestamp ties.
    const next = [...state.queue].sort((a, b) => a.priority - b.priority || a.readyAt.localeCompare(b.readyAt))[0];
    if (!next || next.id !== id) throw new Error('Founder priority and ready ordering refused this request');
    if (next.owner !== this.actor || digest(next.identity) !== digest(identity)) throw new Error('Reservation owner or identity changed');
    state.queue = state.queue.filter((x) => x.id !== id);
    state.reservation = { ...next, namespace: `cf_${id}`, lifecycle: 'active', operation: null, deployments: null,
      evidence: [], recovery: { owner: this.actor, action: 'Restore latest fetched main and verify before release' } };
    await this.write(snapshot, state); return { id, candidate: next.candidate };
  }
  async owned(claim) {
    const snapshot = await this.ledger.read(); const lease = snapshot.state?.reservation;
    if (!lease || lease.id !== claim.id || lease.owner !== this.actor) throw new Error('Current reservation owner required');
    if (lease.candidate !== claim.candidate) throw new Error('Exact reservation candidate required');
    if (digest(lease.identity) !== digest(this.policy)) throw new Error('Reservation identity changed');
    if (lease.operation) throw new Error('Durable in-flight operation requires recovery; inspect before mutation');
    return snapshot;
  }
  proof(receipt, target, restoring = false) {
    if (!receipt || receipt.sha !== target || !receipt.readyz || !receipt.worker || !receipt.media || !receipt.mock ||
        (restoring && (receipt.fixtures !== 'absent' || receipt.schema !== 'unchanged'))) throw new Error('Deployment/restoration proof incomplete');
    return { sha: target, readyz: true, worker: true, media: true, mock: true,
      ...(restoring ? { fixtures: 'absent', schema: 'unchanged' } : {}) };
  }
  async perform(claim, kind, restoring = false) {
    let snapshot = await this.owned(claim);
    await this.platform.authorize(claim);
    await this.attest();
    const target = restoring ? await this.ledger.latestMain() : claim.candidate;
    if (!sha(target)) throw new Error('Exact latest main SHA required');
    if (kind === 'deploy') await this.ledger.assertNoSchemaChange(claim.candidate, await this.ledger.latestMain());
    // Re-read after external lookups. A previously read owner never grants a new operation.
    snapshot = await this.owned(claim);
    const lease = snapshot.state.reservation;
    const operation = { id: this.id(), kind: restoring ? 'restore' : kind, target, startedAt: this.now(), expectedMigrations: await this.ledger.migrationsAt(target) };
    lease.operation = operation; lease.lifecycle = restoring ? 'restoring' : 'active';
    lease.restoration = null;
    await this.write(snapshot, snapshot.state);
    try {
      // A lost write response must not authorize mutation. Re-read the durable operation.
      const current = await this.ledger.read();
      if (current.state?.reservation?.operation?.id !== operation.id || current.state.reservation.owner !== this.actor ||
          current.state.reservation.candidate !== claim.candidate) throw new Error('Operation authority changed');
      await this.attest();
      const result = await this.platform.execute(restoring ? 'restore' : kind, current.state.reservation, target);
      let receipt;
      if (kind === 'deploy') receipt = this.proof(await this.platform.verify(current.state.reservation, target, result), target, restoring);
      const done = await this.ledger.read();
      if (done.state?.reservation?.operation?.id !== operation.id) throw new Error('Operation record changed');
      const owned = done.state.reservation;
      if (receipt) {
        owned.deployments = result.deployments;
        owned.evidence.push({ ...receipt, observedAt: this.now(), deployments: result.deployments });
      }
      if (restoring) owned.restoration = { ...receipt, restoredSha: target };
      owned.operation = null; owned.lifecycle = restoring ? 'restored' : 'active';
      await this.write(done, done.state);
      return { operation: operation.id, target, ...(receipt ?? {}) };
    } catch {
      const failed = await this.ledger.read();
      if (failed.state?.reservation?.operation?.id === operation.id) {
        failed.state.reservation.lifecycle = 'blocked';
        failed.state.reservation.recovery = { owner: this.actor,
          action: 'Inspect live operation and deployment IDs; unknown completion forbids release or takeover' };
        await this.write(failed, failed.state);
      }
      throw new Error('Staging operation blocked; durable recovery retained; provider diagnostics suppressed');
    }
  }
  async operate(claim, kind) {
    if (!['deploy', 'fixture', 'reset'].includes(kind)) throw new Error('Unsupported staging operation');
    return this.perform(claim, kind);
  }
  async restore(claim) { return this.perform(claim, 'deploy', true); }
  async release(claim) {
    let snapshot = await this.owned(claim);
    const restored = snapshot.state.reservation.restoration;
    if (!restored) throw new Error('Verified restoration required');
    if (restored.restoredSha !== await this.ledger.latestMain()) throw new Error('Latest main changed; restore again');
    await this.attest();
    this.proof(await this.platform.verify(snapshot.state.reservation, restored.restoredSha, { deployments: snapshot.state.reservation.deployments }), restored.restoredSha, true);
    snapshot = await this.owned(claim);
    if (snapshot.state.reservation.restoration?.restoredSha !== restored.restoredSha) throw new Error('Restoration changed');
    if (restored.restoredSha !== await this.ledger.latestMain()) throw new Error('Latest main changed; restore again');
    snapshot.state.history.push({ id: claim.id, owner: this.actor, restoredSha: restored.restoredSha, releasedAt: this.now() });
    snapshot.state.reservation = null;
    await this.write(snapshot, snapshot.state);
    return { released: true, restoredSha: restored.restoredSha };
  }
}
