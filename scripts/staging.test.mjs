import test from 'node:test';
import assert from 'node:assert/strict';
import { runStagingCommand } from './staging.mjs';
test('operators can discover the bounded command contract without credentials', async()=>{
  const value=await runStagingCommand(['help']);assert.match(value.usage,/identity/);assert.match(value.usage,/restore/);
});
test('arbitrary command names are refused before reading credentials or creating a ledger',async()=>{
  await assert.rejects(runStagingCommand(['shell']),/Unsupported/);
});

test('campaign operation help names the exact supported profile; unknown profiles and state payloads fail before credentials', async () => {
  assert.match((await runStagingCommand(['help'])).usage, /campaign897-identities-v1/);
  for (const args of [
    ['operate', 'policy', 'claim', 'fixture', 'campaign897-full'],
    ['operate', 'policy', 'claim', 'reset', 'campaign897-identities-v1'],
    ['operate', 'policy', 'claim', 'fixture', 'campaign897-identities-v1', 'historical-cohort'],
  ]) await assert.rejects(runStagingCommand(args), /Unsupported command or arguments/);
});
