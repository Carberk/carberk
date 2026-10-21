import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import { remoteProgram } from './staging-remote.mjs';

function captureFixtureSql() {
  const id = '1'.repeat(32), candidate = 'a'.repeat(40), profile = 'campaign897-business-v2';
  const identity = { projectId: 'graph-project', environmentId: 'graph-staging', services: { api: 'graph-api' },
    origins: { database: 'postgresql://postgres.railway.internal:5432/railway', media: 'http://minio.railway.internal:9000', publicMedia: 'https://media.example' } };
  const runtimeProcess = { exitCode: 0, env: { STAGING_CAMPAIGN_PROFILE_ENABLED: profile,
    RAILWAY_PROJECT_ID: identity.projectId, RAILWAY_ENVIRONMENT_ID: identity.environmentId, RAILWAY_SERVICE_ID: identity.services.api,
    RAILWAY_ENVIRONMENT_NAME: 'staging', APP_ENV: 'staging', SMS_DRIVER: 'mock', AUTOTM_COMMIT_SHA: candidate,
    DATABASE_URL: identity.origins.database, MINIO_ENDPOINT: identity.origins.media, MINIO_PUBLIC_URL: identity.origins.publicMedia } };
  const queries = [], require = createRequire(import.meta.url);
  runInNewContext(remoteProgram({ kind: 'fixture', id, namespace: `cf_${id}`, candidate, target: candidate, profile, identity }), {
    process: runtimeProcess, URL, console: { log() {}, error() {} },
    require: name => name === 'node:child_process' ? { spawnSync(command, _args, { input }) {
      assert.equal(command, 'psql');
      queries.push(input);
      // Capture the real serialized SQL without executing or pretending to validate it.
      return { status: queries.length === 1 ? 0 : 1, stdout: '0\n' };
    } } : require(name),
  });
  assert.equal(queries.length, 2, 'namespace probe followed by fixture SQL');
  return queries[1];
}

test('serialized business trigger variables do not shadow JSON result columns', () => {
  const trigger = captureFixtureSql().match(/CREATE FUNCTION [\s\S]*?track_business\(\)[\s\S]*?AS \$fn\$([\s\S]*?)END \$fn\$/)?.[1];
  assert.ok(trigger, 'actual business trigger must reach the SQL boundary');
  assert.match(trigger, /jsonb_each(?:_text)?\(/);
  const declarations = trigger.match(/DECLARE([\s\S]*?)BEGIN/)[1];
  const names = declarations.split(';').map(declaration => declaration.trim().split(/\s+/)[0]).filter(Boolean);
  // Both PostgreSQL JSON functions expose key/value columns in nested queries.
  assert.deepEqual(names.filter(name => ['key', 'value'].includes(name)), [], 'JSON result names must remain unambiguous');
});


test('serialized integrity guard keeps the row-key CASE inside the IF expression', () => {
  const sql = captureFixtureSql();
  const guard = sql.match(/IF entry\.table_name NOT IN \([^;]+?Unknown campaign row key'; END IF;/)?.[0];
  assert.ok(guard, 'actual integrity guard must reach the SQL boundary');
  // PL/pgSQL reads IF up to THEN at depth zero. CASE must stay nested until END.
  assert.match(guard, /entry\.row_key IS DISTINCT FROM \(CASE WHEN entry\.table_name='staff_grants' THEN jsonb_build_object\('userId',entry\.row_key->>'userId','capability',entry\.row_key->>'capability'\) ELSE jsonb_build_object\('id',entry\.row_key->>'id'\) END\) OR/);
  assert.match(guard, /EXISTS\(SELECT 1 FROM jsonb_each\(entry\.row_key\) e WHERE e\.value='null'::jsonb\) THEN RAISE EXCEPTION 'Unknown campaign row key'/);
});

function captureV3(kind) {
  const id = 'f1'.repeat(16), candidate = 'a'.repeat(40), queries = [];
  const source = readFileSync(new URL('./staging-campaign.mjs', import.meta.url), 'utf8').replaceAll('export function ', 'function ').replaceAll('export async function ', 'async function ');
  const businessMain = runInNewContext(`${source}; businessMain`, { require: createRequire(import.meta.url), console: { log() {} } });
  businessMain({ id, namespace: `cf_${id}`, candidate, target: candidate, profile: 'campaign897-full-v3', kind }, {
    exists: kind === 'reset', uuid: label => `uuid-${label}`, disposeDeliveries() {}, disposeObjects() {},
    sql: query => { queries.push(query); return query.startsWith('SELECT state') ? 'identities' : query.includes('SELECT coalesce(json_agg') ? '[]' : '0'; },
  });
  return queries.join('\n');
}
const serviceTables = ['support_cases', 'service_conversations', 'service_messages', 'service_outbox', 'service_read_states', 'service_audits', 'service_erasure_fences'];

test('v3 journals Support text tables and exposes only a contract-hashed reservation authority', () => {
  const sql = captureV3('fixture');
  for (const table of serviceTables) assert.ok(sql.includes(`CREATE TRIGGER "cf_${'f1'.repeat(16)}_business" AFTER INSERT OR UPDATE OR DELETE ON public.${table} FOR EACH ROW`), table);
  assert.match(sql, /CREATE FUNCTION "cf_(?:f1){16}"\.campaign_service_authority\(principal_id text,session_id text,conversation_id text,peer_id text,runtime_candidate text\) RETURNS boolean LANGUAGE sql/);
  assert.match(sql, /service_contract_hash=md5\(pg_get_functiondef\('"cf_(?:f1){16}"\.campaign_service_authority\(text,text,text,text,text\)'::regprocedure\)\)/);
  // The authority binds the exact live journaled principal and Session, then the requested conversation and peer.
  const authority = sql.match(/AS \$service\$([\s\S]*?)\$service\$/)?.[1] ?? '';
  for (const fragment of ["m.state='identities'", 'm.candidate=$5', "sr.table_name='sessions'", 's."userId"=u.id', "cr.table_name='service_conversations'", "c.purpose='support'", "scr.table_name='support_cases'", "pr.table_name='users'", 'm.journal_hash=', 'm.event_hash=', 'm.tracking_hash=', 'm.schema_hash=']) assert.ok(authority.includes(fragment), fragment);
  // Service ownership edges resolve through service tables, never Listing Conversations.
  assert.ok(sql.includes(`"conversationId":"service_conversations"`) && sql.includes(`"supportCaseId":"support_cases"`) && sql.includes(`"resourceId":"support_cases"`));
  assert.match(sql, /RAISE EXCEPTION 'Unsupported campaign service'/);
  assert.match(sql, /WHEN TG_TABLE_NAME='service_read_states' THEN jsonb_build_object\('conversationId',v_row->>'conversationId','userId',v_row->>'userId'\)/);
  assert.match(sql, /WHEN entry\.table_name='service_read_states' THEN jsonb_build_object\('conversationId',entry\.row_key->>'conversationId','userId',entry\.row_key->>'userId'\)/);
});

test('v3 reset redacts retained service audits exactly and disposes Support text before its parents', () => {
  const sql = captureV3('reset');
  assert.match(sql, /UPDATE public\.service_audits a SET "actorId"=NULL,reason=NULL,"targetStaffId"=NULL,"resourceId"='redacted-synthetic-service' FROM "cf_(?:f1){16}"\.campaign_records r WHERE r\.table_name='service_audits'/);
  const order = ['service_erasure_fences', 'service_read_states', 'service_outbox', 'service_messages', 'service_conversations', 'support_cases', 'staff_grants', 'listings', 'sessions', 'users']
    .map(table => sql.indexOf(`DELETE FROM public.${table} t USING`));
  assert.ok(order.every(index => index > 0), 'every disposal statement present');
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.ok(sql.indexOf('UPDATE public.service_audits a SET') < order[0], 'audits are redacted before any parent can SET NULL them');
  assert.ok(sql.includes(`DELETE FROM public.service_erasure_fences t USING "cf_${'f1'.repeat(16)}".campaign_records r WHERE r.table_name='service_erasure_fences' AND NOT r.deleted AND jsonb_build_object('conversationId',to_jsonb(t)->>'conversationId')=r.row_key;`), 'fence disposal uses its actual non-ID primary key');
  assert.match(sql, /AND table_name NOT IN \('audit_logs','service_audits'\)\) THEN RAISE EXCEPTION 'Campaign disposal incomplete'/);
  assert.match(sql, /RAISE EXCEPTION 'Campaign service audit disposition changed'/);
  // Preflight attributes composite read-state children by their own key.
  assert.ok(sql.includes(`WHEN $3=''service_read_states'' THEN jsonb_build_object(''conversationId'',to_jsonb(child)->>''conversationId'',''userId'',to_jsonb(child)->>''userId'')`));
});

const mediaBinding = { reservationId: 'f1'.repeat(16), namespace: `cf_${'f1'.repeat(16)}`, candidate: 'a'.repeat(40), profile: 'campaign897-full-v3' };
const mediaDirectory = 'pending/12345678-1234-4234-8234-123456789abc/';
const mediaKeys = ['original', 'thumbnail', 'list', 'detail', 'fullscreen'].map(name => `${mediaDirectory}${name}.webp`);
const mediaLedger = mediaKeys.map(key => ({ object_key: key, upload_id: '12345678-1234-4234-8234-123456789def', bucket: 'listing-photos' }));

async function disposeMedia({ ledger = mediaLedger, observeOnly = false, versioning, failDelete, present = new Set(mediaKeys), credentials = true } = {}) {
  const source = readFileSync(new URL('./staging-campaign.mjs', import.meta.url), 'utf8').replaceAll('export function ', 'function ').replaceAll('export async function ', 'async function ');
  const runtime = { exitCode: 0, env: { MINIO_ENDPOINT: 'http://localhost:9000', ...(credentials ? { MINIO_ACCESS_KEY: 'disposable', MINIO_SECRET_KEY: 'secret' } : {}) } };
  const operations = [], logs = [];
  function GetBucketVersioningCommand(input) { this.input = input; }
  function DeleteObjectCommand(input) { this.input = input; }
  function HeadObjectCommand(input) { this.input = input; }
  class S3Client {
    async send(command) {
      operations.push(command.constructor.name);
      if (command instanceof GetBucketVersioningCommand) return { Status: versioning };
      const key = command.input.Key;
      if (command instanceof DeleteObjectCommand) {
        if (key === failDelete) throw new Error('storage unavailable');
        present.delete(key); return {};
      }
      if (!present.has(key)) throw { $metadata: { httpStatusCode: 404 } };
      return {};
    }
    destroy() {}
  }
  const run = runInNewContext(`${source}; typeof campaignObjectMain === 'function' ? campaignObjectMain : undefined`, {
    require: name => { assert.equal(name, '@aws-sdk/client-s3'); return { S3Client, GetBucketVersioningCommand, DeleteObjectCommand, HeadObjectCommand }; },
    process: runtime, URL, AbortSignal, console: { log: value => logs.push(value) },
  });
  assert.equal(typeof run, 'function', 'serialized exact-key object disposer exists');
  await run(ledger, observeOnly, mediaBinding);
  return { code: runtime.exitCode, present: [...present], operations, logs };
}

test('reset deletes only the recorded complete manifest and proves exact absence', async () => {
  const foreignKey = 'pending/22345678-1234-4234-8234-123456789abc/original.webp';
  const result = await disposeMedia({ present: new Set([...mediaKeys, foreignKey]) });
  assert.equal(result.code, 0);
  assert.deepEqual(result.present, [foreignKey]);
  assert.deepEqual(result.logs, ['{"objects":5,"absent":5}']);
});

test('reset refuses malformed or incomplete provenance before any storage operation', async () => {
  for (const ledger of [mediaLedger.slice(1), [...mediaLedger, mediaLedger[0]], mediaLedger.map(row => ({ ...row, object_key: row.object_key.replace('pending/', 'foreign/') })), mediaLedger.map(row => ({ ...row, bucket: 'other' })), Array.from({ length: 641 }, () => mediaLedger[0])]) {
    const result = await disposeMedia({ ledger });
    assert.equal(result.code, 1);
    assert.deepEqual(result.operations, []);
    assert.deepEqual(result.present, mediaKeys);
    assert.deepEqual(result.logs, []);
  }
});

test('versioned storage and missing explicit credentials refuse deletion', async () => {
  for (const options of [{ versioning: 'Enabled' }, { versioning: 'Suspended' }, { credentials: false }]) {
    const result = await disposeMedia(options);
    assert.equal(result.code, 1);
    assert.deepEqual(result.present, mediaKeys);
    assert.deepEqual(result.logs, []);
  }
});

test('partial object failure produces no receipt and the same manifest can retry', async () => {
  const present = new Set(mediaKeys);
  const failed = await disposeMedia({ present, failDelete: mediaKeys[2] });
  assert.equal(failed.code, 1);
  assert.deepEqual(failed.logs, []);
  assert.ok(present.size > 0 && present.size < 5);
  const retried = await disposeMedia({ present });
  assert.equal(retried.code, 0);
  assert.deepEqual(retried.present, []);
});

test('terminal observation is read-only and refuses a resurrected object', async () => {
  const absent = await disposeMedia({ observeOnly: true, present: new Set() });
  assert.equal(absent.code, 0);
  assert.ok(!absent.operations.includes('DeleteObjectCommand'));
  const resurrected = await disposeMedia({ observeOnly: true, present: new Set([mediaKeys[4]]) });
  assert.equal(resurrected.code, 1);
  assert.deepEqual(resurrected.present, [mediaKeys[4]]);
  assert.ok(!resurrected.operations.includes('DeleteObjectCommand'));
  assert.deepEqual(resurrected.logs, []);
});

function resetLifecycle({ state = 'identities', failObjects = false } = {}) {
  const source = readFileSync(new URL('./staging-campaign.mjs', import.meta.url), 'utf8').replaceAll('export function ', 'function ').replaceAll('export async function ', 'async function ');
  const logs = [], transactions = [], objectModes = [];
  const run = runInNewContext(`${source}; businessMain`, { require: createRequire(import.meta.url), console: { log: value => logs.push(value) } });
  const database = { state };
  const execute = () => run({ ...mediaBinding, id: mediaBinding.reservationId, target: mediaBinding.candidate, kind: 'reset' }, {
    exists: true, uuid: label => `uuid-${label}`, disposeDeliveries() {},
    sql(query) {
      if (query.startsWith('BEGIN;')) {
        transactions.push(query);
        if (query.includes("SET state='cleaning'")) database.state = 'cleaning';
        if (query.includes("SET state='disposed'")) database.state = 'disposed';
      }
      if (query.startsWith('SELECT state')) return database.state;
      if (query.includes('SELECT coalesce(json_agg')) return query.includes('.campaign_object_ledger') ? JSON.stringify(mediaLedger) : '[]';
      return '0';
    },
    disposeObjects(ledger, observeOnly) {
      assert.deepEqual(JSON.parse(JSON.stringify(ledger)), mediaLedger);
      objectModes.push(observeOnly);
      if (!observeOnly) {
        assert.equal(database.state, 'cleaning', 'durable intent commits before external object I/O');
        if (failObjects) throw new Error('partial object disposal');
      }
    },
  });
  return { execute, database, transactions, logs, objectModes };
}

test('failed object disposal keeps cleaning with no row disposal or receipt, and the same reset retries', () => {
  const failed = resetLifecycle({ failObjects: true });
  assert.throws(failed.execute, /partial object disposal/);
  assert.equal(failed.database.state, 'cleaning');
  assert.deepEqual(failed.logs, []);
  assert.ok(!failed.transactions.some(query => query.includes('DELETE FROM public.')));
  const retried = resetLifecycle({ state: failed.database.state });
  retried.execute();
  assert.equal(retried.database.state, 'disposed');
  assert.deepEqual(retried.objectModes, [false, true]);
  assert.equal(JSON.parse(retried.logs[0]).state, 'disposed');
});

test('lost-response reset reads terminal object evidence without repeating durable writes', () => {
  const terminal = resetLifecycle({ state: 'disposed' });
  terminal.execute();
  assert.deepEqual(terminal.objectModes, [true]);
  assert.ok(terminal.transactions.every(query => !/\b(UPDATE|INSERT INTO|DELETE FROM)\b/.test(query.replace(/'(?:''|[^'])*'/g, "''"))));
  assert.equal(JSON.parse(terminal.logs[0]).state, 'disposed');
});
