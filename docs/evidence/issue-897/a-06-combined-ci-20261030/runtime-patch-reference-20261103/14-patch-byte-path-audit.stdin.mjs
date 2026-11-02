import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const base = 'bc17e2bc86429d58536e4c3a749f51d9803cbd3a';
const oldHead = 'a6de7b1b51039ea4b1d24ef7db9d8b21ca91d568';
const source = 'scripts/api-image-runtime-smoke.mjs';
const git = (...args) => execFileSync('git', args);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const before = git('show', `${base}:${source}`);
const current = readFileSync(source);
const oldName = 'expo-modules-core@55.0.26.patch';
const newName = 'expo-modules-core@55.0.27.patch';
assert.equal(before.toString().split(oldName).length - 1, 1);
assert.deepEqual(current, Buffer.from(before.toString().replace(oldName, newName)));
const configPath = 'pnpm-workspace.yaml';
const config = readFileSync(configPath);
assert.deepEqual(config, git('show', `${base}:${configPath}`));
const historicalBlobs = {};
for (const path of [source, configPath]) {
  const oldBlob = git('rev-parse', `${oldHead}:${path}`).toString().trim();
  const baseBlob = git('rev-parse', `${base}:${path}`).toString().trim();
  assert.equal(oldBlob, baseBlob);
  historicalBlobs[path] = { oldHead, oldBlob, baseBlob };
}
const array = current.toString().match(/const patches = Object\.fromEntries\(await Promise\.all\(\[([\s\S]*?)\]\.map/);
assert(array);
const names = [...array[1].matchAll(/"([^"\n]+\.patch)"/g)].map(match => match[1]);
assert.deepEqual(names, ['expo-modules-core@55.0.27.patch', 'react-native-reanimated@4.2.1.patch']);
const tracked = git('ls-files', 'patches').toString().trim().split('\n');
assert.deepEqual(tracked, names.map(name => `patches/${name}`));
const patches = names.map(name => {
  const path = `patches/${name}`;
  const dependency = name.slice(0, -'.patch'.length);
  assert(config.toString().includes(`"${dependency}": ${path}`));
  const bytes = readFileSync(path);
  const baseBytes = git('show', `${base}:${path}`);
  assert.deepEqual(bytes, baseBytes);
  const digest = sha256(bytes);
  assert.equal(digest, sha256(baseBytes));
  return { name, path, bytes: bytes.length, sha256: digest, trackedBlob: git('rev-parse', `${base}:${path}`).toString().trim() };
});
const changed = git('diff', '--name-only', base, '--').toString().trim().split('\n').filter(Boolean);
assert.deepEqual(changed, [source]);
let unchangedPaths = 0;
for (const entry of git('ls-tree', '-rz', base).toString().split('\0').filter(Boolean)) {
  const match = entry.match(/^(\d+) blob ([a-f0-9]+)\t([\s\S]+)$/);
  assert(match, entry);
  const [, , blob, path] = match;
  if (path === source) continue;
  assert.equal(git('hash-object', '--', path).toString().trim(), blob, path);
  unchangedPaths++;
}
console.log(JSON.stringify({ base, source, historicalBlobs, patches, sourceBeforeSha256: sha256(before), sourceAfterSha256: sha256(current), fullExpectedBytesEqual: true, unchangedTrackedPaths: unchangedPaths, allOtherTrackedBytesEqual: true, runtimeExecuted: false }, null, 2));
