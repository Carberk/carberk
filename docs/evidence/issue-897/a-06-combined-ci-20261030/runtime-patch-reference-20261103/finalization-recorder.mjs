import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync, unlinkSync, copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = '/tmp/issue936-reference-offline-20261103-r1';
const { base, sourceHead, evidence, cwd } = JSON.parse(readFileSync(`${root}/phase-result.json`));
process.chdir(cwd);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const guard = () => assert(Date.now() < Date.parse('2026-11-02T22:25:00Z'), 'slot expired: hold');
let index = 23;
function run(label, command, args, expected = 0) {
  guard();
  const prefix = `${String(++index).padStart(2, '0')}-${label}`;
  const started = new Date().toISOString();
  const start = process.hrtime.bigint();
  const r = spawnSync(command, args, { cwd, timeout: 90000, maxBuffer: 32 * 1024 * 1024 });
  const stdout = r.stdout ?? Buffer.alloc(0), stderr = r.stderr ?? Buffer.alloc(0);
  writeFileSync(`${root}/${prefix}.stdout`, stdout);
  writeFileSync(`${root}/${prefix}.stderr`, stderr);
  writeFileSync(`${root}/${prefix}.command.json`, JSON.stringify({ cwd, argv: [command, ...args], started, ended: new Date().toISOString(), durationMs: Number(process.hrtime.bigint() - start) / 1e6, exit: r.status, signal: r.signal, error: r.error?.message ?? null, stdoutSha256: hash(stdout), stderrSha256: hash(stderr) }, null, 2) + '\n');
  assert.ifError(r.error);
  assert.equal(r.signal, null);
  assert.equal(r.status, expected, stderr.toString());
  return stdout.toString();
}
guard();
const priorManifest = JSON.parse(readFileSync(`${evidence}/artifact-sha256.json`));
for (const entry of priorManifest) assert.equal(hash(readFileSync(`${evidence}/${entry.path}`)), entry.sha256, entry.path);
assert.equal(run('source-head-recheck', 'git', ['rev-parse', 'HEAD']).trim(), sourceHead);
assert.equal(run('scaffold-preservation', 'git', ['rev-parse', 'refs/heads/t3/b0b6a4c4']).trim(), base);
assert.equal(run('source-only-range', 'git', ['diff', '--name-only', base, sourceHead]).trim(), 'scripts/api-image-runtime-smoke.mjs');
assert.equal(run('tracked-working-clean', 'git', ['diff', '--name-only']).trim(), '');
const rawNames = readdirSync(root).filter(name => name.endsWith('.command.json'));
for (const name of rawNames) {
  const receipt = JSON.parse(readFileSync(`${root}/${name}`));
  const prefix = name.slice(0, -'.command.json'.length);
  assert.equal(receipt.exit, 0, name);
  assert.equal(receipt.signal, null, name);
  assert.equal(hash(readFileSync(`${root}/${prefix}.stdout`)), receipt.stdoutSha256, name);
  assert.equal(hash(readFileSync(`${root}/${prefix}.stderr`)), receipt.stderrSha256, name);
}
assert.match(readFileSync(`${root}/12-historical-hosted-red.stdout`, 'utf8'), /ENOENT: no such file or directory, open 'patches\/expo-modules-core@55\.0\.26\.patch'/);
const untracked = run('allowed-untracked-paths', 'git', ['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
assert(untracked.length > 0);
assert(untracked.every(path => path.startsWith(evidence + '/')));
// Preserve original raw streams in /tmp and archive them losslessly in evidence.
// Base64 avoids treating historical log/diff whitespace as newly authored text.
for (const name of readdirSync(root).filter(name => /^\d\d-/.test(name))) {
  if (name.endsWith('.stdout') || name.endsWith('.stderr')) {
    writeFileSync(`${evidence}/${name}.base64`, readFileSync(`${root}/${name}`).toString('base64') + '\n');
  } else copyFileSync(`${root}/${name}`, `${evidence}/${name}`);
}
const encoding = [];
for (const name of readdirSync(evidence).filter(name => name.endsWith('.stdout') || name.endsWith('.stderr'))) {
  const bytes = readFileSync(`${evidence}/${name}`);
  assert.deepEqual(bytes, Buffer.from(readFileSync(`${evidence}/${name}.base64`, 'utf8').trim(), 'base64'));
  encoding.push({ rawName: name, archivedAs: `${name}.base64`, rawSha256: hash(bytes), rawBytes: bytes.length });
  unlinkSync(`${evidence}/${name}`);
}
for (const name of readdirSync(evidence).filter(name => name.endsWith('.base64'))) {
  const rawName = name.slice(0, -'.base64'.length);
  if (encoding.some(entry => entry.rawName === rawName)) continue;
  const raw = readFileSync(`${root}/${rawName}`);
  assert.deepEqual(raw, Buffer.from(readFileSync(`${evidence}/${name}`, 'utf8').trim(), 'base64'));
  encoding.push({ rawName, archivedAs: name, rawSha256: hash(raw), rawBytes: raw.length });
}
writeFileSync(`${evidence}/raw-stream-encoding.json`, JSON.stringify(encoding, null, 2) + '\n');
copyFileSync('/tmp/issue936-reference-finalize-20261103.mjs', `${evidence}/finalization-recorder.mjs`);
writeFileSync(`${evidence}/handoff.md`, readFileSync(`${evidence}/handoff.md`, 'utf8') + '\nRaw stdout/stderr streams are archived losslessly as base64 files. Decode each with Node Buffer.from(text.trim(), "base64"); raw-stream-encoding.json and each command receipt record the original byte count and SHA256. Original raw streams also remain in the owned /tmp directory. No raw historical log or diff was normalized.\n');
writeFileSync(`${evidence}/artifact-sha256.json`, JSON.stringify(readdirSync(evidence).filter(name => name !== 'artifact-sha256.json').sort().map(name => { const bytes = readFileSync(`${evidence}/${name}`); return { path: name, bytes: bytes.length, sha256: hash(bytes) }; }), null, 2) + '\n');
run('stage-evidence', 'git', ['add', '--', evidence]);
const staged = run('staged-paths', 'git', ['diff', '--cached', '--name-only', '-z']).split('\0').filter(Boolean);
assert(staged.every(path => path.startsWith(evidence + '/')));
run('evidence-diff-check', 'git', ['diff', '--cached', '--check']);
run('commit-evidence', 'git', ['commit', '-m', 'docs: record issue 936 bounded patch reference verification']);
const evidenceHead = run('evidence-head', 'git', ['rev-parse', 'HEAD']).trim();
const evidenceTree = run('evidence-tree', 'git', ['rev-parse', 'HEAD^{tree}']).trim();
const allPaths = run('terminal-path-audit', 'git', ['diff', '--name-only', base, evidenceHead, '-z']).split('\0').filter(Boolean);
assert(allPaths.every(path => path === 'scripts/api-image-runtime-smoke.mjs' || path.startsWith(evidence + '/')));
assert.equal(run('terminal-source-only-diff', 'git', ['diff', sourceHead, evidenceHead, '--', '.', ':(exclude)docs/**']), '');
run('terminal-full-diff-check', 'git', ['diff', '--check', base, evidenceHead]);
assert.equal(run('terminal-clean', 'git', ['status', '--porcelain=v1']), '');
run('push-checkpoints', 'git', ['push', 'origin', 'agent/issue-936']);
assert.equal(run('remote-head', 'git', ['ls-remote', '--heads', 'origin', 'agent/issue-936']).trim(), `${evidenceHead}\trefs/heads/agent/issue-936`);
assert.equal(run('terminal-upstream', 'git', ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']).trim(), 'origin/agent/issue-936');
assert.equal(run('final-clean', 'git', ['status', '--porcelain=v1']), '');
const terminal = { phase: 'bounded offline implementation/static verification delivered; unassembled', base, sourceHead, evidenceHead, evidenceTree, branch: 'agent/issue-936', upstream: 'origin/agent/issue-936', cwd, scaffold: { branch: 't3/b0b6a4c4', head: base, preserved: true }, clean: true, pushed: true, nextOwner: 'existing A coordinator', openGates: ['assembled independent #924/#934 source-readiness', '#938 affected prerequisites', 'published-SHA hosted image runtime/migration assertions and cleanup', 'milestone acceptance'], cleanup: 'keep unassembled/unmerged worktree, scaffold, branch and owned /tmp recovery outputs', completed: new Date().toISOString() };
writeFileSync(`${root}/terminal-handoff.json`, JSON.stringify(terminal, null, 2) + '\n');
writeFileSync(`${root}/terminal-artifact-sha256.json`, JSON.stringify(readdirSync(root).filter(name => name !== 'terminal-artifact-sha256.json').sort().map(name => ({ path: name, sha256: hash(readFileSync(`${root}/${name}`)) })), null, 2) + '\n');
console.log(JSON.stringify(terminal, null, 2));
