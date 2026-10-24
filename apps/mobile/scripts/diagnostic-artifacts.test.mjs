import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const cli = fileURLToPath(new URL('./diagnostic-artifacts.mjs', import.meta.url));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const identity = {
  candidateSha: '9bcbf1e6f325a9a36cba98fa6e8c796b4e67a408',
  appId: 'tm.auto.fixture', platform: 'android', buildNumber: '42',
  release: 'fixture@2.0.4', dist: '42',
  bundle: { kind: 'hermes', id: 'fixture-bundle-42', runtimeVersion: 'fixture-runtime', updateId: null },
};
function fixture(t, platform = 'android') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'diagnostic-artifacts-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'build');
  fs.mkdirSync(source);
  const expected = structuredClone(identity);
  expected.platform = platform;
  const metadata = { schemaVersion: 1, identity: structuredClone(expected), files: {}, nativeAssociations: [] };
  function file(role, bytes) {
    const name = `${role}.fixture`;
    fs.writeFileSync(path.join(source, name), bytes);
    metadata.files[role] = { path: name, sha256: digest(bytes) };
  }
  // Deliberately dummy output bytes, never a native build or map qualification.
  file('artifact', 'fixture artifact');
  file('jsBundle', 'fixture final bundle');
  file('finalSourceMap', 'fixture composed map');
  if (platform === 'android') file('r8Mapping', 'fixture R8 mapping');
  const expectedPath = path.join(root, 'expected.json');
  const metadataPath = path.join(source, 'build-metadata.json');
  const archive = path.join(root, 'retained');
  function save() {
    fs.writeFileSync(expectedPath, JSON.stringify(expected));
    fs.writeFileSync(metadataPath, JSON.stringify(metadata));
  }
  function run(mode = 'prepare') {
    save();
    return spawnSync(process.execPath, [cli, mode, expectedPath, mode === 'prepare' ? metadataPath : archive, ...(mode === 'prepare' ? [archive] : [])], { encoding: 'utf8' });
  }
  return { root, source, expected, metadata, archive, file, run };
}
function succeeds(result) { assert.equal(result.status, 0, result.stderr); }
function refuses(result, reason) { assert.notEqual(result.status, 0); assert.match(result.stderr, reason); }

test('retains digested final outputs privately and verifies after build cleanup', (t) => {
  const f = fixture(t);
  succeeds(f.run());
  const manifest = JSON.parse(fs.readFileSync(path.join(f.archive, 'manifest.json')));
  assert.deepEqual(manifest.identity, identity);
  assert.equal(manifest.files.artifact.sha256, '70ea06053509b85e86aaa7ae9a844c489068f32741581cb6b773af42e272d088');
  assert.equal(manifest.nativeAssociationStatus, 'unsupported-incomplete');
  assert.equal(fs.statSync(f.archive).mode & 0o777, 0o700);
  assert.equal(fs.statSync(path.join(f.archive, manifest.files.finalSourceMap.path)).mode & 0o777, 0o600);
  fs.rmSync(f.source, { recursive: true });
  // Verification must not depend on original source paths.
  const result = spawnSync(process.execPath, [cli, 'verify', path.join(f.root, 'expected.json'), f.archive], { encoding: 'utf8' });
  succeeds(result);
  assert.match(result.stdout, /unsupported-incomplete/);
});

for (const key of ['candidateSha', 'appId', 'platform', 'buildNumber', 'release', 'dist', 'bundle']) {
  test(`refuses mismatched ${key} against expected candidate`, (t) => {
    const f = fixture(t);
    f.metadata.identity[key] = key === 'bundle' ? { ...identity.bundle, id: 'wrong' } : 'wrong';
    refuses(f.run(), /identity|platform/);
    assert.equal(fs.existsSync(f.archive), false);
  });
  test(`refuses missing ${key}`, (t) => {
    const f = fixture(t);
    delete f.metadata.identity[key];
    refuses(f.run(), /identity|platform/);
  });
}
for (const role of ['artifact', 'jsBundle', 'finalSourceMap', 'r8Mapping']) {
  test(`refuses missing or changed ${role} output`, (t) => {
    const f = fixture(t);
    fs.writeFileSync(path.join(f.source, f.metadata.files[role].path), 'changed bytes');
    refuses(f.run(), /digest/);
    fs.rmSync(path.join(f.source, f.metadata.files[role].path));
    refuses(f.run(), /ENOENT|regular file/);
  });
}

test('refuses absent digest, map, R8 mapping and source directories as artifacts', (t) => {
  const f = fixture(t);
  delete f.metadata.files.artifact.sha256;
  refuses(f.run(), /sha256/);
  f.metadata.files.artifact.sha256 = digest('fixture artifact');
  delete f.metadata.files.finalSourceMap;
  refuses(f.run(), /finalSourceMap/);
  f.file('finalSourceMap', 'fixture composed map');
  delete f.metadata.files.r8Mapping;
  refuses(f.run(), /r8Mapping/);
  f.file('r8Mapping', 'fixture R8 mapping');
  f.metadata.files.artifact.path = '.';
  refuses(f.run(), /regular file/);
});

test('refuses overwriting archives and detects retained map and metadata tampering', (t) => {
  const f = fixture(t);
  succeeds(f.run());
  const before = fs.readFileSync(path.join(f.archive, 'manifest.json'));
  refuses(f.run(), /exist/);
  assert.deepEqual(fs.readFileSync(path.join(f.archive, 'manifest.json')), before);
  const manifest = JSON.parse(before);
  fs.writeFileSync(path.join(f.archive, manifest.files.finalSourceMap.path), 'wrong map');
  refuses(f.run('verify'), /digest/);
  fs.writeFileSync(path.join(f.archive, manifest.files.finalSourceMap.path), 'fixture composed map');
  fs.appendFileSync(path.join(f.archive, 'build-metadata.json'), ' ');
  refuses(f.run('verify'), /digest/);
});

test('records matching exported native IDs without claiming binary verification', (t) => {
  const f = fixture(t, 'ios');
  f.file('symbols0', 'fixture dSYM DWARF file');
  f.metadata.nativeAssociations = [{ file: 'symbols0', idKind: 'macho-uuid', arch: 'arm64', binaryId: 'exported-uuid', symbolId: 'exported-uuid' }];
  succeeds(f.run());
  const manifest = JSON.parse(fs.readFileSync(path.join(f.archive, 'manifest.json')));
  assert.deepEqual(manifest.nativeAssociations, f.metadata.nativeAssociations);
  assert.equal(manifest.nativeAssociationStatus, 'exported-metadata-only-incomplete');
  succeeds(f.run('verify'));
});

test('refuses mismatched native IDs, missing symbols and wrong platform mappings', (t) => {
  const f = fixture(t, 'ios');
  f.file('symbols0', 'fixture DWARF');
  f.metadata.nativeAssociations = [{ file: 'symbols0', idKind: 'macho-uuid', arch: 'arm64', binaryId: 'uuid-a', symbolId: 'uuid-b' }];
  refuses(f.run(), /native.*ID/i);
  f.metadata.nativeAssociations[0].symbolId = 'uuid-a';
  delete f.metadata.files.symbols0;
  refuses(f.run(), /symbols0/);
  f.file('symbols0', 'fixture DWARF');
  f.file('r8Mapping', 'android only');
  refuses(f.run(), /iOS/);
});

test('refuses symlink inputs and archive destinations inside the mobile cleanup tree', (t) => {
  const f = fixture(t);
  fs.symlinkSync('artifact.fixture', path.join(f.source, 'link'));
  f.metadata.files.artifact.path = 'link';
  refuses(f.run(), /regular file/);
  f.metadata.files.artifact.path = 'artifact.fixture';
  succeeds(f.run());
  const result = spawnSync(process.execPath, [cli, 'prepare', path.join(f.root, 'expected.json'), path.join(f.source, 'build-metadata.json'), path.join(path.dirname(cli), '../android/retained')], { encoding: 'utf8' });
  refuses(result, /outside.*mobile/);
});

for (const key of ['release', 'buildNumber', 'platform', 'bundle']) {
  test(`archive verification refuses changed expected ${key}`, (t) => {
    const f = fixture(t);
    succeeds(f.run());
    f.expected[key] = key === 'bundle' ? { ...identity.bundle, updateId: 'different-update' } : 'different';
    refuses(f.run('verify'), /identity|platform/);
  });
}

test('refuses malformed matching identities, unassociated symbols and wrong native ID kind', (t) => {
  const f = fixture(t);
  f.expected.release = f.metadata.identity.release = '';
  refuses(f.run(), /release/);
  f.expected.release = f.metadata.identity.release = identity.release;
  f.file('symbols0', 'fixture native symbols');
  refuses(f.run(), /Missing native ID/);
  f.metadata.nativeAssociations = [{ file: 'symbols0', idKind: 'macho-uuid', arch: 'arm64', binaryId: 'fixture-id', symbolId: 'fixture-id' }];
  refuses(f.run(), /platform/);
  f.metadata.nativeAssociations[0].idKind = 'elf-build-id';
  succeeds(f.run());
  succeeds(f.run('verify'));
});

test('archive verification refuses manifest path substitution and missing retained symbols', (t) => {
  const f = fixture(t, 'ios');
  f.file('symbols0', 'fixture DWARF');
  f.metadata.nativeAssociations = [{ file: 'symbols0', idKind: 'macho-uuid', arch: 'arm64', binaryId: 'fixture-uuid', symbolId: 'fixture-uuid' }];
  succeeds(f.run());
  const manifestPath = path.join(f.archive, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath));
  const original = structuredClone(manifest);
  manifest.files.symbols0.path = '../build/symbols0.fixture';
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  refuses(f.run('verify'), /Manifest/);
  fs.writeFileSync(manifestPath, JSON.stringify(original));
  fs.rmSync(path.join(f.archive, original.files.symbols0.path));
  refuses(f.run('verify'), /ENOENT/);
});

test('refuses empty outputs and cleanup destinations reached through a symlink parent', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.source, 'artifact.fixture'), '');
  f.metadata.files.artifact.sha256 = digest('');
  refuses(f.run(), /Empty output/);
  f.file('artifact', 'fixture artifact');
  succeeds(f.run());
  const link = path.join(f.root, 'mobile-link');
  fs.symlinkSync(path.dirname(cli), link);
  const result = spawnSync(process.execPath, [cli, 'prepare', path.join(f.root, 'expected.json'), path.join(f.source, 'build-metadata.json'), path.join(link, 'retained')], { encoding: 'utf8' });
  refuses(result, /outside.*mobile/);
});

test('archive verification refuses public permissions on maps or archive', (t) => {
  const f = fixture(t);
  succeeds(f.run());
  fs.chmodSync(f.archive, 0o755);
  refuses(f.run('verify'), /permissions/);
  fs.chmodSync(f.archive, 0o700);
  fs.chmodSync(path.join(f.archive, 'finalSourceMap.artifact'), 0o644);
  refuses(f.run('verify'), /permissions/);
});

test('binds bundle bytes without inventing unavailable IDs and requires runtime identity for updates', (t) => {
  const f = fixture(t);
  f.expected.bundle = f.metadata.identity.bundle = { kind: 'javascript', id: null, runtimeVersion: null, updateId: null };
  succeeds(f.run());
  succeeds(f.run('verify'));
  f.expected.bundle.updateId = 'actual-exported-update';
  refuses(f.run('verify'), /runtimeVersion/);
});
