import test from 'node:test';
import assert from 'node:assert/strict';
import { runStagingCommand } from './staging.mjs';
test('operators can discover the bounded command contract without credentials', async()=>{
  const value=await runStagingCommand(['help']);assert.match(value.usage,/identity/);assert.match(value.usage,/restore/);
});
test('arbitrary command names are refused before reading credentials or creating a ledger',async()=>{
  await assert.rejects(runStagingCommand(['shell']),/Unsupported/);
});
