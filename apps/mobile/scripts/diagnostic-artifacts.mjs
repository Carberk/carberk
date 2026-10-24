#!/usr/bin/env node
/** Offline association of supplied outputs. No builds, uploads or binary parsing. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = fs.realpathSync(fileURLToPath(new URL('..', import.meta.url)));
const identityKeys = ['candidateSha', 'appId', 'platform', 'buildNumber', 'release', 'dist', 'bundle'];
function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}
function text(value) { return typeof value === 'string' && value.trim().length > 0; }
function keys(value, expected, label) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label} keys mismatch`);
}
function validateIdentity(value) {
  keys(value, identityKeys, 'identity');
  for (const key of identityKeys.filter((key) => key !== 'bundle')) {
    requireValue(text(value[key]), `identity.${key} is required`);
  }
  requireValue(/^[a-f0-9]{40}$/.test(value.candidateSha), 'identity.candidateSha must be a full SHA');
  requireValue(['android', 'ios'].includes(value.platform), 'identity.platform must be android or ios');
  keys(value.bundle, ['kind', 'id', 'runtimeVersion', 'updateId'], 'identity.bundle');
  requireValue(['javascript', 'hermes'].includes(value.bundle.kind), 'identity.bundle.kind is required');
  for (const key of ['id', 'runtimeVersion']) {
    requireValue(value.bundle[key] === null || text(value.bundle[key]), `identity.bundle.${key} must be explicit`);
  }
  requireValue(value.bundle.updateId === null || text(value.bundle.updateId), 'identity.bundle.updateId must be explicit');
  requireValue(value.bundle.updateId === null || text(value.bundle.runtimeVersion), 'identity.bundle update requires its exported runtimeVersion');
}
function regularFile(filename) {
  requireValue(fs.lstatSync(filename).isFile(), `Expected regular file: ${filename}`);
}
function sha256(filename) {
  regularFile(filename);
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const hash = createHash('sha256');
    const buffer = Buffer.alloc(1024 * 1024);
    let count;
    while ((count = fs.readSync(fd, buffer)) > 0) hash.update(buffer.subarray(0, count));
    requireValue(fs.fstatSync(fd).size > 0, `Empty output is not an artifact: ${filename}`);
    return hash.digest('hex');
  } finally { fs.closeSync(fd); }
}
function readJson(filename) {
  regularFile(filename);
  return JSON.parse(fs.readFileSync(filename, 'utf8'));
}
function validateMetadata(metadata, expected) {
  keys(metadata, ['schemaVersion', 'identity', 'files', 'nativeAssociations'], 'build metadata');
  requireValue(metadata.schemaVersion === 1, 'Unsupported metadata schemaVersion');
  validateIdentity(expected);
  validateIdentity(metadata.identity);
  assert.deepEqual(metadata.identity, expected, 'Build identity does not match expected candidate identity');
  const files = metadata.files;
  requireValue(files && typeof files === 'object' && !Array.isArray(files), 'files must be an object');
  for (const role of ['artifact', 'jsBundle', 'finalSourceMap', ...(expected.platform === 'android' ? ['r8Mapping'] : [])]) {
    requireValue(files[role], `Missing required ${role}`);
  }
  requireValue(!(expected.platform === 'ios' && files.r8Mapping), 'iOS cannot associate an R8 mapping');
  for (const [role, entry] of Object.entries(files)) {
    requireValue(/^(artifact|jsBundle|finalSourceMap|r8Mapping|symbols[0-9]+)$/.test(role), `Unsupported artifact role: ${role}`);
    keys(entry, ['path', 'sha256'], role);
    requireValue(text(entry.path), `${role}.path is required`);
    requireValue(typeof entry.sha256 === 'string' && /^[a-f0-9]{64}$/.test(entry.sha256), `${role}.sha256 is required`);
  }
  requireValue(Array.isArray(metadata.nativeAssociations), 'nativeAssociations must be an explicit array');
  const associatedFiles = new Set();
  for (const entry of metadata.nativeAssociations) {
    keys(entry, ['file', 'idKind', 'arch', 'binaryId', 'symbolId'], 'native association');
    requireValue(/^symbols[0-9]+$/.test(entry.file) && files[entry.file], `Missing native symbols file: ${entry.file}`);
    requireValue((expected.platform === 'ios' ? ['macho-uuid'] : ['elf-build-id', 'debug-id']).includes(entry.idKind), 'Native ID kind does not match platform');
    requireValue(text(entry.arch) && text(entry.binaryId) && entry.binaryId === entry.symbolId, 'Native binary/symbol ID mismatch or missing arch');
    requireValue(!associatedFiles.has(entry.file), 'Duplicate native symbol association');
    associatedFiles.add(entry.file);
  }
  for (const role of Object.keys(files).filter((role) => role.startsWith('symbols'))) {
    requireValue(associatedFiles.has(role), `Missing native ID association for ${role}`);
  }
}
function describe(metadata, metadataDigest) {
  return {
    schemaVersion: 1,
    identity: metadata.identity,
    metadataSha256: metadataDigest,
    files: Object.fromEntries(Object.entries(metadata.files).map(([role, entry]) => [role, { path: `${role}.artifact`, sha256: entry.sha256 }])),
    nativeAssociations: metadata.nativeAssociations,
    nativeAssociationStatus: metadata.nativeAssociations.length ? 'exported-metadata-only-incomplete' : 'unsupported-incomplete',
    evidenceLimits: 'Digests and exported associations only. No binary/map parsing, signing, provenance attestation, collector compatibility or symbolication proof. Native capture remains unqualified.',
  };
}
function checkFiles(metadata, locate) {
  const paths = new Set();
  for (const [role, entry] of Object.entries(metadata.files)) {
    const filename = locate(role, entry);
    requireValue(!paths.has(fs.realpathSync(filename)), 'Each artifact role requires a distinct supplied file');
    paths.add(fs.realpathSync(filename));
    requireValue(sha256(filename) === entry.sha256, `${role} digest mismatch`);
  }
}
function verify(expected, archive) {
  requireValue(fs.lstatSync(archive).isDirectory(), 'Archive must be a real directory');
  requireValue((fs.statSync(archive).mode & 0o077) === 0, 'Archive permissions must be private');
  for (const filename of fs.readdirSync(archive)) {
    requireValue((fs.lstatSync(path.join(archive, filename)).mode & 0o077) === 0, 'Retained file permissions must be private');
  }
  const manifest = readJson(path.join(archive, 'manifest.json'));
  const metadataPath = path.join(archive, 'build-metadata.json');
  const metadata = readJson(metadataPath);
  validateMetadata(metadata, expected);
  const described = describe(metadata, sha256(metadataPath));
  assert.deepEqual(manifest, described, 'Manifest metadata/digest mismatch');
  checkFiles(metadata, (role) => path.join(archive, described.files[role].path));
  return manifest;
}
function prepare(expected, metadataPath, destination) {
  // Existing local prebuild/Gradle cleanup can replace the entire native tree.
  // Keep the retained copy outside mobile, including through parent symlinks.
  const requested = path.resolve(destination);
  requireValue(requested !== mobileRoot && !requested.startsWith(`${mobileRoot}${path.sep}`), 'Archive must be outside the mobile tree');
  const archive = path.join(fs.realpathSync(path.dirname(path.resolve(destination))), path.basename(destination));
  requireValue(archive !== mobileRoot && !archive.startsWith(`${mobileRoot}${path.sep}`), 'Archive must be outside the mobile tree');
  requireValue(!fs.existsSync(archive), 'Archive already exists; refusing overwrite');
  const metadata = readJson(metadataPath);
  const metadataDigest = sha256(metadataPath);
  validateMetadata(metadata, expected);
  const locate = (_role, entry) => path.resolve(path.dirname(metadataPath), entry.path);
  checkFiles(metadata, locate);
  const manifest = describe(metadata, metadataDigest);
  fs.mkdirSync(archive, { mode: 0o700 }); // Exclusive reservation, never overwrite.
  try {
    for (const [role, entry] of Object.entries(metadata.files)) {
      const target = path.join(archive, manifest.files[role].path);
      fs.copyFileSync(locate(role, entry), target, fs.constants.COPYFILE_EXCL);
      fs.chmodSync(target, 0o600);
    }
    const retainedMetadata = path.join(archive, 'build-metadata.json');
    fs.copyFileSync(metadataPath, retainedMetadata, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(retainedMetadata, 0o600);
    fs.writeFileSync(path.join(archive, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    // Recheck retained bytes before returning. Changed inputs cannot produce success.
    return verify(expected, archive);
  } catch (error) {
    fs.rmSync(archive, { recursive: true, force: true });
    throw error;
  }
}
try {
  const [mode, expectedPath, input, destination, ...extra] = process.argv.slice(2);
  requireValue(extra.length === 0 && expectedPath && input && ((mode === 'prepare' && destination) || (mode === 'verify' && !destination)),
    'Usage: diagnostic-artifacts.mjs prepare expected.json build-metadata.json /private/archive | verify expected.json /private/archive');
  const expected = readJson(expectedPath);
  const manifest = mode === 'prepare' ? prepare(expected, input, destination) : verify(expected, input);
  // Never print source paths, maps or exported build metadata to public logs.
  console.log(`Artifact digests verified; native association: ${manifest.nativeAssociationStatus}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
