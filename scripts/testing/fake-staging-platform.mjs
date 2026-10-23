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
}
