import test from 'node:test';
import assert from 'node:assert/strict';
import { RailwayPlatform } from './staging-railway.mjs';
import { observeQuiescence } from './staging-quiescence.mjs';

const request = {
  operationId: '1'.repeat(32), candidate: 'a'.repeat(40),
  identity: { projectId: 'project', environmentId: 'stage', environmentName: 'staging',
    services: { api: 'api', worker: 'worker' }, credentialScope: 'project:project:stage',
    origins: { database: 'postgresql://postgres.railway.internal:5432/railway', media: 'http://minio.railway.internal:9000', publicMedia: 'https://media.example', api: 'https://api.example' } },
};

test('caller JSON cannot claim quiescence or invoke an executor', async () => {
  const effects = [];
  const platform = new RailwayPlatform({ token: 'boundary-token', fetch: async () => { effects.push('network'); throw new Error('Unexpected network'); }, command: async () => { effects.push('executor'); } });
  await assert.rejects(observeQuiescence(platform, { ...request, quiesced: true }), /Exact quiescence request required/);
  assert.deepEqual(effects, []);
});
