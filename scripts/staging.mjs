#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { GitLedger } from './staging-ledger.mjs';
import { StagingControl } from './staging-control.mjs';
import { RailwayPlatform } from './staging-railway.mjs';

const run = promisify(execFile);
const remote = 'https://github.com/bagtyyarkovusov/auto.tm-rewrite.git';
const projectId = '176ddec0-dd65-4087-b82c-798599fc2ebe';
const usage = `pnpm staging:control help | discover | inspect
pnpm staging:control identity POLICY.json
pnpm staging:control enqueue POLICY.json REQUEST.json
pnpm staging:control acquire POLICY.json REQUEST_ID
pnpm staging:control operate POLICY.json CLAIM.json deploy|fixture|reset [campaign897-identities-v1]
pnpm staging:control recover POLICY.json CLAIM.json
pnpm staging:control restore POLICY.json CLAIM.json
pnpm staging:control release POLICY.json CLAIM.json
Live mutations require independent review and explicit reservation authorization. No force-unlock exists.`;
async function execute(program, args) {
  try { return (await run(program, args, { timeout: 60000, maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, GH_PROMPT_DISABLED: '1', RAILWAY_CALLER: 'skill:use-railway@1.1.3', RAILWAY_AGENT_SESSION: 'staging-control-901' } })).stdout; }
  catch { throw new Error('Operator identity/discovery unavailable; diagnostics suppressed'); }
}
async function json(file) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch { throw new Error('Required JSON input unavailable or invalid'); }
}
export async function runStagingCommand(args) {
  const [command = 'help', ...values] = args;
  const lengths = { help: 0, discover: 0, inspect: 0, identity: 1, enqueue: 2, acquire: 2, operate: 3, restore: 2, recover: 2, release: 2 };
  if (!(command in lengths) || (values.length !== lengths[command] && !(command === 'operate' && values.length === 4 && values[2] === 'fixture' && values[3] === 'campaign897-identities-v1'))) throw new Error('Unsupported command or arguments; use help');
  if (command === 'help') return { usage };
  if (command === 'discover') {
    const projects = JSON.parse(await execute('railway', ['list', '--json']));
    const project = projects.find(x => x.id === projectId);
    if (!project) throw new Error('Authoritative AutoTM project unavailable');
    const environments = project.environments.edges.map(x => x.node).filter(x => x.name === 'staging');
    if (environments.length !== 1) throw new Error('Ambiguous staging identity');
    return { projectId, environmentId: environments[0].id, environmentName: 'staging',
      services: Object.fromEntries(project.services.edges.filter(x => ['api', 'worker', 'admin', 'web'].includes(x.node.name)).map(x => [x.node.name, x.node.id])),
      verified: 'CLI identity discovery only; credential scope and data/media origins remain unverified' };
  }
  const directory = await mkdtemp(join(tmpdir(), 'carberk-staging-objects-'));
  try {
    const ledger = new GitLedger({ directory, remote, authenticateWithGh: true });
    if (command === 'inspect') return (await ledger.read()).state ?? { reservation: null, queue: [] };
    const policy = await json(values[0]);
    if (policy.projectId !== projectId || policy.environmentId !== '652abc79-fdb0-48b0-9f6c-ad0ff572d7b2' ||
        policy.services?.api !== '6db6f1b1-5c7a-4033-88d0-53f5f315bfc0' || policy.services?.worker !== '24aa02e0-25a9-4e80-9cc2-c1795ef82091' ||
        (policy.services.admin && policy.services.admin !== '69ba9f86-0000-4460-8165-de69b289b36e') ||
        (policy.services.web && policy.services.web !== 'f3c5888b-d303-44b1-bc6e-3d775dad4639')) throw new Error('Wrong AutoTM staging project/environment/service identity');
    const actor = (await execute('gh', ['api', 'user', '--jq', '.login'])).trim();
    const platform = new RailwayPlatform({ token: process.env.STAGING_RAILWAY_PROJECT_TOKEN,
      authorization: process.env.STAGING_MUTATIONS_AUTHORIZATION });
    const control = new StagingControl({ ledger, platform, policy, actor,
      actorIdentity: async () => (await execute('gh', ['api', 'user', '--jq', '.login'])).trim(),
      now: () => new Date().toISOString(), id: () => randomUUID().replaceAll('-', '') });
    if (command === 'identity') return control.attest();
    if (command === 'enqueue') return { requestId: await control.enqueue(await json(values[1])) };
    if (command === 'acquire') return control.acquire(values[1]);
    const claim = await json(values[1]);
    if (command === 'operate') return control.operate(claim, values[2], values[3]);
    if (command === 'recover') return control.recover(claim);
    if (command === 'restore') return control.restore(claim);
    return control.release(claim);
  } finally { await rm(directory, { recursive: true, force: true }); }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await runStagingCommand(process.argv.slice(2)), null, 2)); }
  catch (error) { console.error(error instanceof Error ? error.message : 'Reserved staging command refused'); process.exitCode = 1; }
}
