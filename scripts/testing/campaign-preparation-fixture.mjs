import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { campaignMain, businessMain } from '../staging-campaign.mjs';

// SQL generation only for the disposable DB suite. Never executes SQL, reset,
// delivery disposal, object disposal or an operational bootstrap command.
const [profile, id, candidate] = process.argv.slice(2);
if (!['campaign897-identities-v1', 'campaign897-full-v3'].includes(profile) ||
    !/^[a-f0-9]{32}$/.test(id ?? '') || !/^[a-f0-9]{40}$/.test(candidate ?? '')) {
  throw new Error('campaign SQL fixture arguments');
}
// businessMain is serialized into the CommonJS operational wrapper normally.
globalThis.require = createRequire(import.meta.url);
let setup;
const captured = new Error("campaign fixture SQL captured");
const log = console.log;
try {
  console.log = () => {};
  (profile === 'campaign897-full-v3' ? businessMain : campaignMain)(
    { profile, id, candidate, target: candidate, namespace: `cf_${id}`, kind: 'fixture' },
    {
      exists: false,
      uuid(label) {
        const h = createHash('sha256').update(`${id}:${label}`).digest('hex');
        return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
      },
      sql(sql) {
        if (!sql.includes('CREATE SCHEMA')) throw new Error('unexpected fixture query before setup');
        setup = sql;
        throw captured;
      },
      disposeDeliveries() { throw new Error('SQL fixture cannot dispose deliveries'); },
      disposeObjects() { throw new Error('SQL fixture cannot dispose objects'); },
    },
  );
} catch (error) {
  if (error !== captured) throw error;
} finally { console.log = log; }
if (!setup || setup.includes("SET state='cleaning'")) throw new Error('campaign SQL fixture generation');
process.stdout.write(setup);
