// Durable staging coordination transport. Implementation follows the recorded red checkpoint.
export class GitLedger {
  constructor(options) { this.options = options; }
  async read() { return { revision: null, state: null }; }
  async compareAndSwap() { return false; }
}
