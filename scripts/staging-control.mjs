export class StagingControl {
  constructor(dependencies) { Object.assign(this, dependencies); }
  async enqueue() { throw new Error('Reservation queue not implemented'); }
}
