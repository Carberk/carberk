import { GitLedger } from '../staging-ledger.mjs';
const ledger = new GitLedger(JSON.parse(process.argv[2]));
const snapshot = await ledger.read();
process.send({ ready: true });
process.once('message', async () => {
  const won = await ledger.compareAndSwap(snapshot.revision, { owner: process.argv[3], candidate: 'a'.repeat(40) });
  process.send({ won });
  process.disconnect();
});
