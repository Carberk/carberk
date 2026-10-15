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
}
