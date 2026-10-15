export class RailwayPlatform {
  constructor(dependencies) { Object.assign(this, dependencies); }
  async attest() { throw new Error('Live scoped Railway attestation not implemented'); }
}
