import { createHash } from 'node:crypto';

const sha = (value) => /^[a-f0-9]{40}$/.test(value ?? '');
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const empty = () => ({ version: 1, queue: [], reservation: null, history: [] });
const business = 'campaign897-business-v2';
const campaign = profile => ['campaign897-identities-v1', business].includes(profile);

/** Shared controller/adapter contract for the independent storage probe, never auth or delivery proof. */
export function businessReceipt(lease, result, target, { observed = true, disposed = false } = {}) {
  const terminal = result?.state === 'disposed';
  if (lease.fixtureProfile !== business || lease.namespace !== `cf_${lease.id}` ||
      result?.profile !== business || result.reservationId !== lease.id || result.candidate !== lease.candidate ||
      result.namespace !== lease.namespace || result.protectedReceipt !== `${lease.namespace}.campaign_entities` ||
      !['identities', 'cleaning', 'disposed'].includes(result.state) ||
      result.identities !== (terminal ? 0 : 15) || result.fixtures !== (terminal ? 'absent' : 'present') ||
      result.tombstone !== terminal || (disposed && !terminal) ||
      ['queueJobs', 'sinkRecords', 'cleanupVersion', 'deliveryCleanup', 'authenticated', 'admission', 'entities', 'emails'].some(key => Object.hasOwn(result, key)))
    throw new Error('Business storage receipt binding or disposition incomplete');
  if (observed) {
    const inventory = lease.operation?.expectedMigrations ?? lease.expectedMigrations;
    const schema = lease.operation?.schemaDisposition ?? lease.schemaDisposition;
    if (result.sha !== target || !Array.isArray(inventory) || inventory.length === 0 ||
        inventory.some((entry, index) => !/^\d+_[a-zA-Z0-9_]+$/.test(entry?.name ?? '') || !/^[a-f0-9]{64}$/.test(entry?.checksum ?? '') ||
          (index > 0 && inventory[index - 1].name >= entry.name)) ||
        digest(result.migrations) !== digest(inventory) || !['unchanged', 'retained-additive'].includes(schema) || result.schema !== schema)
      throw new Error('Business storage receipt runtime/schema inventory incomplete');
    if (terminal) {
      const disposal = result.storageDisposal;
      if (!disposal || Object.keys(disposal).sort().join(',') !== 'auditDisposition,retainedAudits,rows,scope,state,tombstone,version' ||
          disposal.version !== 1 || disposal.scope !== 'business-v2-storage' || disposal.state !== 'disposed' ||
          disposal.rows !== 'absent' || disposal.retainedAudits !== 2 ||
          disposal.auditDisposition !== 'redacted-synthetic-audit' || disposal.tombstone !== 'retained')
        throw new Error('Complete versioned business storage disposal receipt required');
    } else if (Object.hasOwn(result, 'storageDisposal')) throw new Error('Partial business storage disposal receipt refused');
  }
  return { profile: business, reservationId: lease.id, candidate: lease.candidate, namespace: lease.namespace,
    protectedReceipt: result.protectedReceipt, state: result.state, identities: result.identities, fixtures: result.fixtures,
    tombstone: result.tombstone, ...(observed ? { sha: result.sha, migrations: result.migrations, schema: result.schema,
      ...(terminal ? { storageDisposal: structuredClone(result.storageDisposal) } : {}) } : {}) };
}

/** Durable reset history, including the original candidate deployment authority after downgrade. */
export function businessDisposalEvidence(lease, now) {
  const evidence = lease.evidence?.findLast(e => ['fixture', 'reset', 'deploy'].includes(e.kind) ||
    (e.kind === 'recovery' && ['fixture', 'reset', 'deploy'].includes(e.recoveredOperation?.kind)));
  if (!evidence || (evidence.kind !== 'reset' && evidence.recoveredOperation?.kind !== 'reset') ||
      evidence.owner !== lease.owner || !/^[a-f0-9]{32}$/.test(evidence.operationId ?? '') ||
      !Number.isFinite(Date.parse(evidence.startedAt)) || !Number.isFinite(Date.parse(evidence.observedAt)) ||
      Date.parse(evidence.observedAt) < Date.parse(evidence.startedAt) || (now && Date.parse(evidence.observedAt) > Date.parse(now)) ||
      !evidence.deployments || Object.keys(evidence.deployments).sort().join(',') !== Object.keys(lease.identity.services).sort().join(',') ||
      Object.values(evidence.deployments).some(id => typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(id)) ||
      digest(evidence.deployments) !== digest(lease.operation?.disposalDeployments ?? lease.restoration?.candidateDeployments ?? lease.deployments))
    throw new Error('Complete current durable business storage disposal required');
  businessReceipt({ ...lease, operation: null,
    schemaDisposition: lease.operation?.disposalSchema ?? lease.restoration?.candidateSchema ?? lease.schemaDisposition },
  evidence, lease.candidate, { disposed: true });
  return evidence;
}
function validPolicy(p) {
  if (!p || Object.keys(p).sort().join(',') !== 'credentialScope,environmentId,environmentName,origins,projectId,services' ||
      Object.keys(p.origins ?? {}).sort().join(',') !== 'api,database,media,publicMedia') throw new Error('Explicit staging identity schema required');
  if ([p.projectId, p.environmentId, ...Object.values(p.services ?? {})].some(x => typeof x !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(x))) throw new Error('Invalid staging identity IDs');
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
    if (this.actorIdentity && await this.actorIdentity() !== this.actor) throw new Error('Authenticated coordination owner changed');
    if (!await this.ledger.compareAndSwap(snapshot.revision, next)) throw new Error('Reservation changed or persistence uncertain; inspect before retry');
  }
  async attest(requireMock = true) {
    let actual; try { actual = await this.platform.attest(this.policy, { requireMock }); } catch { throw new Error('Authoritative staging attestation unavailable'); }
    validPolicy(actual);
    if (digest(actual) !== digest(this.policy)) throw new Error('Authoritative staging identity or origins mismatch');
    return actual;
  }
  async enqueue(request) {
    if (!sha(request.candidate) || !Number.isSafeInteger(request.parent) || request.parent < 1 ||
        !Number.isSafeInteger(request.pr) || request.pr < 1 || !Number.isSafeInteger(request.priority) || request.priority < 0 ||
        !/^https:\/\/github\.com\/bagtyyarkovusov\/auto\.tm-rewrite\/(issues|pull)\/[1-9]\d*(#issuecomment-[1-9]\d*)?$/.test(request.priorityEvidence ?? '')) throw new Error('Invalid reservation request');
    const id = this.id(); if (!/^[a-f0-9]{32}$/.test(id)) throw new Error('Invalid reservation ID');
    const snapshot = await this.ledger.read(); const state = snapshot.state ?? empty();
    if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(this.actor)) throw new Error('Authenticated GitHub actor required');
    const { parent, pr, candidate, priority, priorityEvidence } = request;
    state.queue.push({ parent, pr, candidate, priority, priorityEvidence, id, owner: this.actor, readyAt: this.now(), identity: structuredClone(this.policy) });
    await this.write(snapshot, state); return id;
  }
  async acquire(id) {
    const identity = await this.attest(false);
    const snapshot = await this.ledger.read(); const state = snapshot.state ?? empty();
    if (state.reservation) throw new Error('Staging already reserved; inspect recovery state');
    // Stable stored insertion order breaks equal timestamp ties.
    const next = [...state.queue].sort((a, b) => a.priority - b.priority || a.readyAt.localeCompare(b.readyAt))[0];
    if (!next || next.id !== id) throw new Error('Founder priority and ready ordering refused this request');
    if (next.owner !== this.actor || digest(next.identity) !== digest(identity)) throw new Error('Reservation owner or identity changed');
    state.queue = state.queue.filter((x) => x.id !== id);
    state.reservation = { ...next, namespace: `cf_${id}`, lifecycle: 'active', operation: null, deployments: null,
      expectedMigrations: state.history.at(-1)?.migrations, schemaDisposition: state.history.at(-1)?.schemaDisposition,
      evidence: [], recovery: { owner: this.actor, action: 'Restore latest fetched main and verify before release' } };
    await this.write(snapshot, state); return { id, candidate: next.candidate };
  }
  async owned(claim, recovering = false) {
    const snapshot = await this.ledger.read(); const lease = snapshot.state?.reservation;
    if (!lease || lease.id !== claim.id || lease.owner !== this.actor) throw new Error('Current reservation owner required');
    if (lease.candidate !== claim.candidate) throw new Error('Exact reservation candidate required');
    if (digest(lease.identity) !== digest(this.policy)) throw new Error('Reservation identity changed');
    if (lease.operation && !recovering) throw new Error('Durable in-flight operation requires recovery; inspect before mutation');
    return snapshot;
  }
  proof(receipt, target, restoring = false) {
    if (!receipt || receipt.sha !== target || !receipt.readyz || !receipt.worker || !receipt.media || !receipt.mock ||
        (restoring && (receipt.fixtures !== 'absent' || !['unchanged', 'retained-additive'].includes(receipt.schema)))) throw new Error('Deployment/restoration proof incomplete');
    return { sha: target, readyz: true, worker: true, media: true, mock: true,
      migrations: receipt.migrations, schema: receipt.schema,
      ...(restoring ? { fixtures: 'absent', schema: receipt.schema } : {}) };
  }
  campaignDisposed(lease) {
    if (lease.fixtureProfile === business) {
      try { businessDisposalEvidence(lease, this.now()); return true; } catch { return false; }
    }
    const evidence = lease.evidence.findLast(e => ['fixture', 'reset'].includes(e.kind) ||
      (e.kind === 'recovery' && ['fixture', 'reset'].includes(e.recoveredOperation?.kind)));
    return evidence && (evidence.kind === 'reset' || evidence.recoveredOperation?.kind === 'reset') &&
      evidence.reservationId === lease.id && evidence.candidate === lease.candidate && evidence.namespace === lease.namespace &&
      evidence.profile === lease.fixtureProfile && evidence.state === 'disposed' && evidence.identities === 0 &&
      evidence.protectedReceipt === `${lease.namespace}.campaign_entities` && evidence.tombstone === true &&
      evidence.cleanupVersion === 1 && evidence.deliveryCleanup === 'disposed' && evidence.queueJobs === 0 && evidence.sinkRecords === 0 &&
      /^[a-f0-9]{32}$/.test(evidence.operationId ?? '') && Number.isFinite(Date.parse(evidence.observedAt));
  }
  async requireCampaignDisposal(snapshot) {
    const lease = snapshot.state.reservation;
    if (!campaign(lease.fixtureProfile) || this.campaignDisposed(lease)) return;
    if (lease.fixtureProfile === business) {
      lease.recovery = { owner: this.actor, action: 'Keep candidate deployed. Complete the exact current business storage reset and persist its independent versioned probe before restoring main. Storage disposal proves no auth or delivery cleanup.' };
      await this.write(snapshot, snapshot.state);
      throw new Error('Complete current durable business storage disposal required before restoration');
    }
    lease.recovery = { owner: this.actor,
      action: 'Keep candidate enqueue/send fences deployed. Complete the current reservation campaign reset and persist exact disposed queue/sink proof before restoring latest main. Unknown or partial cleanup retains ownership.' };
    await this.write(snapshot, snapshot.state);
    throw new Error('Complete durable campaign disposal required before restoration; reset while candidate fences remain deployed');
  }
  async mutationAuthority(claim, expected) {
    // Provider preflight awaits external state. Its earlier lease copy grants
    // no mutation authority until the current durable owner and journal agree.
    if (this.actorIdentity && await this.actorIdentity() !== this.actor) throw new Error('Authenticated coordination owner changed');
    if (expected.operation.kind === 'restore' && await this.ledger.latestMain() !== expected.operation.target)
      throw new Error('Latest main moved before restoration');
    const current = await this.owned(claim, true);
    if (digest(current.state.reservation) !== digest(expected)) throw new Error('Durable mutation authority changed');
    return current;
  }
  async perform(claim, kind, restoring = false, profile) {
    let snapshot = await this.owned(claim);
    const selectedProfile = snapshot.state.reservation.fixtureProfile ?? 'listing-v1';
    if (profile !== undefined && (!['listing-v1', 'campaign897-identities-v1', business].includes(profile) || kind !== 'fixture' || restoring)) throw new Error('Unsupported fixture profile');
    if (profile && profile !== selectedProfile && (snapshot.state.reservation.fixtureProfile || snapshot.state.reservation.evidence.some(e => e.kind === 'fixture'))) throw new Error('Fixture profile cannot change within a reservation');
    await this.platform.authorize(claim);
    await this.attest();
    const plannedRevision = snapshot.revision;
    const target = restoring ? await this.ledger.latestMain() : claim.candidate;
    if (!sha(target)) throw new Error('Exact latest main SHA required');
    const schemaPlan = kind === 'deploy' ? await this.ledger.schemaPlan(restoring ? target : claim.candidate, restoring ? target : await this.ledger.latestMain(), snapshot.state.reservation.expectedMigrations) : null;
    // Re-read after external lookups. A previously read owner never grants a new operation.
    snapshot = await this.owned(claim);
    if (snapshot.revision !== plannedRevision) throw new Error('Reservation changed during operation planning; inspect before retry');
    if (restoring) await this.requireCampaignDisposal(snapshot);
    const lease = snapshot.state.reservation;
    const operation = { id: this.id(), reservationId: lease.id, owner: lease.owner, namespace: lease.namespace, candidate: lease.candidate, kind: restoring ? 'restore' : kind, target, startedAt: this.now(), expectedMigrations: schemaPlan?.migrations ?? lease.expectedMigrations ?? await this.ledger.migrationsAt(target), schemaDisposition: schemaPlan?.disposition ?? lease.schemaDisposition ?? 'unchanged' };
    if (kind === 'fixture') lease.fixtureProfile = profile ?? selectedProfile;
    operation.profile = lease.fixtureProfile ?? selectedProfile;
    if (restoring && operation.profile === business) {
      if (digest(operation.expectedMigrations) !== digest(lease.expectedMigrations)) throw new Error('Business storage disposal inventory differs from restoration plan');
      operation.disposalDeployments = structuredClone(lease.restoration?.candidateDeployments ?? lease.deployments);
      operation.disposalSchema = lease.restoration?.candidateSchema ?? lease.schemaDisposition;
      operation.runtimeBeforeRestore = lease.restoration?.restoredSha ?? lease.candidate;
    }
    lease.operation = operation; lease.lifecycle = restoring ? 'restoring' : 'active';
    lease.restoration = null;
    await this.write(snapshot, snapshot.state);
    try {
      // A lost write response must not authorize mutation. Re-read the durable operation.
      const current = await this.ledger.read();
      if (current.state?.reservation?.operation?.id !== operation.id || current.state.reservation.owner !== this.actor ||
          current.state.reservation.candidate !== claim.candidate) throw new Error('Operation authority changed');
      await this.attest();
      if (restoring && operation.profile === business && await this.ledger.latestMain() !== target) throw new Error('Latest main moved before restoration');
      if (operation.profile === business) {
        const attested = await this.owned(claim, true);
        if (attested.revision !== current.revision || digest(attested.state.reservation.operation) !== digest(operation))
          throw new Error('Business operation changed during final attestation');
      }
      const expected = structuredClone(current.state.reservation);
      const beforeMutation = operation.profile === business ? () => this.mutationAuthority(claim, expected) : undefined;
      const result = await this.platform.execute(restoring ? 'restore' : kind, current.state.reservation, target, async (role, deploymentId) => {
        if (!(role in lease.identity.services) || typeof deploymentId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(deploymentId)) throw new Error('Invalid deployment receipt');
        const progress = beforeMutation ? await beforeMutation() : await this.ledger.read();
        if (progress.state?.reservation?.operation?.id !== operation.id) throw new Error('Operation authority changed');
        progress.state.reservation.operation.deployments ??= {};
        progress.state.reservation.operation.deployments[role] = deploymentId;
        await this.write(progress, progress.state);
        expected.operation.deployments = structuredClone(progress.state.reservation.operation.deployments);
      }, beforeMutation);
      let receipt;
      if (kind === 'deploy') receipt = this.proof(await this.platform.verify(current.state.reservation, target, result), target, restoring);
      if (restoring && await this.ledger.latestMain() !== target) throw new Error('Latest main moved during restoration; retain recovery state');
      const done = await this.ledger.read();
      if (done.state?.reservation?.operation?.id !== operation.id) throw new Error('Operation record changed');
      const owned = done.state.reservation;
      if (operation.profile === business && (owned.fixtureProfile !== business || owned.namespace !== operation.namespace ||
          owned.owner !== operation.owner || owned.candidate !== operation.candidate ||
          digest({ ...owned.operation, deployments: undefined }) !== digest({ ...operation, deployments: undefined })))
        throw new Error('Business completion authority changed');
      if (receipt) {
        owned.deployments = result.deployments;
        owned.expectedMigrations = operation.expectedMigrations;
        owned.schemaDisposition = operation.schemaDisposition;
        owned.evidence.push({ ...receipt, ...(operation.profile === business && !restoring ? { kind: 'deploy' } : {}), observedAt: this.now(), deployments: result.deployments, migrations: operation.expectedMigrations });
      }
      const campaignReceipt = campaign(operation.profile) && ['fixture', 'reset'].includes(kind) ? this.campaignReceipt(result, owned, kind) : {};
      if (['fixture', 'reset'].includes(kind)) owned.evidence.push({ kind, operationId: operation.id, namespace: owned.namespace, observedAt: this.now(), ...campaignReceipt,
        ...(operation.profile === business ? { owner: owned.owner, startedAt: operation.startedAt, deployments: structuredClone(owned.deployments) } : {}),
        ...(kind === 'fixture' ? { listingId: result.listingId, sellerId: result.sellerId } : {}) });
      if (restoring) owned.restoration = { ...receipt, restoredSha: target,
        ...(operation.profile === business ? { candidateDeployments: operation.disposalDeployments, candidateSchema: operation.disposalSchema } : {}) };
      owned.operation = null; owned.lifecycle = restoring ? 'restored' : 'active';
      await this.write(done, done.state);
      return { operation: operation.id, target, ...(receipt ?? {}), ...campaignReceipt,
        ...(kind === 'fixture' ? { listingId: result.listingId, sellerId: result.sellerId, namespace: lease.namespace } : {}) };
    } catch {
      const failed = await this.ledger.read();
      if (failed.state?.reservation?.operation?.id === operation.id) {
        failed.state.reservation.lifecycle = 'blocked';
        failed.state.reservation.recovery = { owner: this.actor,
          action: 'Use recover only after all recorded deployments are active SUCCESS with exact SHA/schema and fixture proof; partial or unknown deployments require reviewed completion, never release or takeover' };
        await this.write(failed, failed.state);
      }
      throw new Error('Staging operation blocked; durable recovery retained; provider diagnostics suppressed');
    }
  }
  campaignReceipt(result, lease, kind) {
    if (lease.fixtureProfile === business) {
      const receipt = businessReceipt(lease, result, lease.candidate, { disposed: kind === 'reset' });
      if (kind === 'fixture' && result.state !== 'identities') throw new Error('Business fixture identities proof incomplete');
      return receipt;
    }
    if (result?.profile !== 'campaign897-identities-v1' || result.candidate !== lease.candidate ||
        result.protectedReceipt !== `${lease.namespace}.campaign_entities` ||
        result.fixtures !== (kind === 'fixture' ? 'present' : 'absent') ||
        result.state !== (kind === 'fixture' ? 'identities' : 'disposed') || result.identities !== (kind === 'fixture' ? 4 : 0)) throw new Error('Campaign disposition proof incomplete');
    if (kind === 'reset' && (result.reservationId !== lease.id || result.cleanupVersion !== 1 || result.deliveryCleanup !== 'disposed' ||
        result.queueJobs !== 0 || result.sinkRecords !== 0 || result.tombstone !== true)) throw new Error('Campaign delivery disposal proof incomplete');
    return { reservationId: lease.id, candidate: lease.candidate, namespace: lease.namespace,
      ...(kind === 'reset' ? { cleanupVersion: result.cleanupVersion, deliveryCleanup: result.deliveryCleanup, queueJobs: result.queueJobs, sinkRecords: result.sinkRecords } : {}),
      profile: result.profile, state: result.state, identities: result.identities,
      protectedReceipt: result.protectedReceipt, retainedAudits: result.retainedAudits, tombstone: result.tombstone };
  }
  async continueCampaignReset(claim, snapshot) {
    const lease = snapshot.state.reservation; const operation = lease.operation;
    if (!campaign(lease.fixtureProfile) || operation.kind !== 'reset' ||
        operation.profile !== lease.fixtureProfile || operation.reservationId !== lease.id || operation.owner !== this.actor ||
        operation.namespace !== lease.namespace || operation.candidate !== lease.candidate || operation.target !== lease.candidate ||
        !/^[a-f0-9]{32}$/.test(operation.id ?? '') || !Array.isArray(operation.expectedMigrations))
      throw new Error('Only the exact bound in-flight campaign reset can continue; retain ownership and inspect legacy or changed operation');
    await this.platform.authorize(claim); await this.attest();
    const checked = await this.owned(claim, true);
    if (checked.revision !== snapshot.revision || digest(checked.state.reservation.operation) !== digest(operation))
      throw new Error('Campaign reset changed during attestation; retain recovery state');
    // A CAS attempt journal excludes stale contenders without replacing the cleanup operation ID.
    operation.continuation = { id: this.id(), requestedAt: this.now() };
    lease.recovery = { owner: this.actor, action: lease.fixtureProfile === business
      ? 'Continue only this exact business storage reset on the candidate; retain its ID until independent versioned storage disposal is durable. Auth and delivery are unproven.'
      : 'Continue only this explicit campaign reset while candidate fences remain deployed; retain the operation until exact queue/sink disposal is durably recorded' };
    await this.write(snapshot, snapshot.state);
    try {
      const current = await this.owned(claim, true);
      if (digest(current.state.reservation.operation) !== digest(operation)) throw new Error('Reset continuation authority changed');
      // The platform reattests identity, current candidate deployment IDs and readiness.
      // Remote cleaning/disposal idempotency is the authority, never a caller success flag.
      const expected = structuredClone(current.state.reservation);
      const result = await this.platform.execute('reset', current.state.reservation, operation.target, undefined,
        lease.fixtureProfile === business ? () => this.mutationAuthority(claim, expected) : undefined);
      const proof = this.campaignReceipt(result, current.state.reservation, 'reset');
      const done = await this.owned(claim, true);
      if (digest(done.state.reservation.operation) !== digest(operation)) throw new Error('Reset completion authority changed');
      const completed = done.state.reservation;
      completed.evidence.push({ ...proof, kind: 'reset', operationId: operation.id, observedAt: this.now(),
        ...(lease.fixtureProfile === business ? { owner: lease.owner, startedAt: operation.startedAt, deployments: structuredClone(lease.deployments) } : {}) });
      completed.operation = null; completed.lifecycle = 'active';
      completed.recovery = { owner: this.actor, action: 'Restore latest fetched main and verify before release' };
      await this.write(done, done.state);
      return { operation: operation.id, target: operation.target, ...proof };
    } catch {
      // A lost response never clears the operation. Another explicit same-reset call
      // rechecks authority and observes/resumes the durable remote cleaning state.
      throw new Error('Campaign reset incomplete; retain candidate fences and ownership, inspect and explicitly repeat only this exact reset');
    }
  }
  async operate(claim, kind, profile) {
    if (!['deploy', 'fixture', 'reset'].includes(kind)) throw new Error('Unsupported staging operation');
    if (kind === 'reset' && profile === undefined) {
      const snapshot = await this.owned(claim, true);
      if (snapshot.state.reservation.operation) return this.continueCampaignReset(claim, snapshot);
    }
    return this.perform(claim, kind, false, profile);
  }
  async restore(claim) { return this.perform(claim, 'deploy', true); }
  async recover(claim) {
    const snapshot = await this.owned(claim, true); const lease = snapshot.state.reservation; const operation = lease.operation;
    if (!operation || !['deploy', 'restore', 'fixture', 'reset'].includes(operation.kind) || !sha(operation.target) ||
        !Array.isArray(operation.expectedMigrations)) throw new Error('Known durable operation required for recovery');
    if (lease.fixtureProfile === business && (operation.profile !== business || operation.reservationId !== lease.id ||
        operation.owner !== lease.owner || operation.candidate !== lease.candidate || operation.namespace !== lease.namespace ||
        !/^[a-f0-9]{32}$/.test(operation.id ?? '') || !Number.isFinite(Date.parse(operation.startedAt)) ||
        (operation.kind !== 'restore' && operation.target !== lease.candidate))) throw new Error('Exact bound business recovery operation required');
    if (lease.fixtureProfile === business && operation.kind === 'restore' && await this.ledger.latestMain() !== operation.target)
      throw new Error('Latest main moved; interrupted restoration cannot recover');
    await this.platform.authorize(claim); await this.attest();
    const deployments = ['deploy', 'restore'].includes(operation.kind) ? operation.deployments : lease.deployments;
    if (!deployments || Object.keys(deployments).sort().join(',') !== Object.keys(lease.identity.services).sort().join(',')) throw new Error('Complete deployment journal required for recovery; partial state retains reservation');
    if (operation.kind === 'restore') await this.requireCampaignDisposal(snapshot);
    // Recovery observes only. It never retries a deployment, resets data or guesses a lost ID.
    const result = await this.platform.recover(lease, operation.target, { deployments });
    const restoring = operation.kind === 'restore';
    const receipt = this.proof(result, operation.target, restoring);
    if (campaign(lease.fixtureProfile) && ['fixture', 'reset'].includes(operation.kind)) Object.assign(receipt, this.campaignReceipt(result, lease, operation.kind));
    if ((operation.kind === 'fixture' && result.fixtures !== 'present') ||
        (operation.kind === 'reset' && result.fixtures !== 'absent')) throw new Error('Recovery fixture disposition incomplete');
    if (restoring && await this.ledger.latestMain() !== operation.target) throw new Error('Latest main moved; interrupted restoration cannot recover');
    const current = await this.owned(claim, true);
    if (digest(current.state.reservation.operation) !== digest(operation)) throw new Error('Recovery operation changed');
    const owned = current.state.reservation;
    owned.deployments = deployments; owned.expectedMigrations = operation.expectedMigrations;
    owned.schemaDisposition = operation.schemaDisposition;
    owned.evidence.push({ ...receipt, kind: 'recovery', operationId: operation.id, namespace: owned.namespace, recoveredOperation: structuredClone(operation),
      ...(lease.fixtureProfile === business ? { owner: lease.owner, startedAt: operation.startedAt } : {}),
      deployments, migrations: operation.expectedMigrations, fixtures: result.fixtures, observedAt: this.now() });
    if (restoring) owned.restoration = { ...receipt, restoredSha: operation.target,
      ...(lease.fixtureProfile === business ? { candidateDeployments: operation.disposalDeployments, candidateSchema: operation.disposalSchema } : {}) };
    owned.operation = null; owned.lifecycle = restoring ? 'restored' : 'active';
    owned.recovery = { owner: this.actor, action: 'Restore latest fetched main and verify before release' };
    await this.write(current, current.state);
    return { recoveredOperation: operation.id, ...receipt };
  }
  async release(claim) {
    let snapshot = await this.owned(claim);
    const restored = snapshot.state.reservation.restoration;
    if (!restored) throw new Error('Verified restoration required');
    await this.requireCampaignDisposal(snapshot);
    if (restored.restoredSha !== await this.ledger.latestMain()) throw new Error('Latest main changed; restore again');
    await this.attest();
    this.proof(await this.platform.verify(snapshot.state.reservation, restored.restoredSha, { deployments: snapshot.state.reservation.deployments }), restored.restoredSha, true);
    snapshot = await this.owned(claim);
    if (snapshot.state.reservation.restoration?.restoredSha !== restored.restoredSha) throw new Error('Restoration changed');
    if (restored.restoredSha !== await this.ledger.latestMain()) throw new Error('Latest main changed; restore again');
    snapshot.state.history.push({ id: claim.id, owner: this.actor, restoredSha: restored.restoredSha, releasedAt: this.now(),
      migrations: snapshot.state.reservation.expectedMigrations, schemaDisposition: snapshot.state.reservation.schemaDisposition,
      ...(snapshot.state.reservation.fixtureProfile === business ? {
        storageDisposal: businessDisposalEvidence(snapshot.state.reservation, this.now()).storageDisposal,
        disposalEvidence: businessDisposalEvidence(snapshot.state.reservation, this.now()) } : {}) });
    snapshot.state.reservation = null;
    await this.write(snapshot, snapshot.state);
    return { released: true, restoredSha: restored.restoredSha };
  }
}
