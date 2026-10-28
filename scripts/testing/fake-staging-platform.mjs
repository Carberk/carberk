export class FakeStagingPlatform {
  constructor(policy) { this.policy = structuredClone(policy); this.operations = []; this.fail = false; this.main = 'c'.repeat(40); }
  async authorize() {}
  async attest() { return structuredClone(this.policy); }
  async execute(kind, lease, target) {
    this.operations.push({ kind, target, namespace: lease.namespace });
    if (this.fail) throw new Error('Secret provider diagnostic must never escape');
    return { deployments: { api: 'deployment-api', worker: 'deployment-worker' } };
  }
  async recover(lease, target) { return this.verify(lease, target); }
  async verify(lease, target) { return { sha: target, readyz: true, worker: true, media: true, mock: true, fixtures: 'absent', schema: 'unchanged' }; }
  configureCleanReset(candidate) {
    this.reset = {
      configurationDigest: '1'.repeat(64), referenceDigest: '2'.repeat(64), scopeDigest: '3'.repeat(64),
      providerContract: { revision: 'qualified-disposable-provider-v1', automaticPaths: {
        crash: 'desired-zero', rollout: 'desired-zero', cron: 'desired-zero', wake: 'desired-zero',
      } },
      desired: Object.fromEntries(Object.keys(this.policy.services).map(role => [role, { 'eu-west': 1 }])),
      executions: Object.keys(this.policy.services).map(role => ({ role, deploymentId: `old-${role}`, instanceId: `old-${role}-instance`, bootId: `old-${role}-boot`, mode: 'business', candidate })),
      executor: { role: 'api', deploymentId: 'reset-api', instanceId: 'reset-api-instance', bootId: 'reset-api-boot',
        mode: 'maintenance-before-nest', candidate, entrypointDigest: '4'.repeat(64) },
      storage: { serviceId: 'minio', configurationDigest: '5'.repeat(64), epochs: ['minio-old'], accepted: [] },
      clock: { source: 'storage-trusted', epoch: 'time-authority-1', ticksMs: 0, storageTimeMs: 1000000, errorMs: 1 },
      issuance: null,
    };
  }
  async cleanResetBaseline() { return structuredClone(this.reset); }
  async stopCleanReset(lease, operation, beforeEffect) {
    await beforeEffect();
    this.reset.desired = Object.fromEntries(Object.entries(this.reset.desired).map(([role, regions]) => [role,
      Object.fromEntries(Object.keys(regions).map(region => [region, 0]))]));
    this.reset.executions = [structuredClone(this.reset.executor)];
    this.operations.push({ kind: 'stop-applications', operationId: operation.id });
    if (this.loseStopReply) { this.loseStopReply = false; throw new Error('Lost stop reply'); }
  }
  async observeCleanReset() {
    if (this.beforeResetRead) await this.beforeResetRead();
    return structuredClone(this.reset);
  }
  async drainCleanReset(lease, operation, beforeEffect) {
    await beforeEffect();
    this.operations.push({ kind: 'drain-storage', operationId: operation.id });
    if (!this.surviveDrain) { this.reset.storage.epochs = ['minio-new']; this.reset.storage.accepted = []; }
    if (this.loseDrainReply) { this.loseDrainReply = false; throw new Error('Lost drain reply'); }
  }
}
