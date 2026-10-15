import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { evaluateSchemaPlan, retainedSchemaProfile } from './staging-schema.mjs';

const run = promisify(execFile);

/** Each caller owns its scratch object directory; the shared remote ref is the lock. */
export class GitLedger {
  constructor({ directory, remote, ref = 'refs/heads/ops/staging-lease', authenticateWithGh = false }) {
    if (!/^refs\/heads\/ops\/staging-[a-z0-9-]+$/.test(ref)) throw new Error('Invalid coordination ref');
    Object.assign(this, { directory, remote, ref, authenticateWithGh });
  }
  async git(args, input, raw = false) {
    // execFile has no input option. Blob/tree input uses the child's stdin without a shell.
    return new Promise((resolve, reject) => {
      const child = execFile('git', [...(this.authenticateWithGh ? ['-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential'] : []), '--git-dir', this.directory, ...args], {
        encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_AUTHOR_NAME: 'Staging controls',
          GIT_AUTHOR_EMAIL: 'staging-controls@invalid', GIT_COMMITTER_NAME: 'Staging controls', GIT_COMMITTER_EMAIL: 'staging-controls@invalid' },
      }, (error, stdout) => error ? reject(new Error('Coordination Git operation failed')) : resolve(raw ? stdout : stdout.trim()));
      child.stdin.end(input);
    });
  }
  async initialize() {
    await mkdir(this.directory, { recursive: true });
    try { await run('git', ['init', '--bare', this.directory], { timeout: 10000 }); }
    catch { throw new Error('Coordination object store unavailable'); }
  }
  async read() {
    await this.initialize();
    const found = await this.git(['ls-remote', '--refs', this.remote, this.ref]);
    if (!found) return { revision: null, state: null };
    const revision = found.split(/\s/)[0];
    await this.git(['fetch', '--no-tags', this.remote, revision]);
    let state;
    try { state = JSON.parse(await this.git(['show', `${revision}:reservation.json`])); }
    catch { throw new Error('Coordination record is invalid; retain reservation for recovery'); }
    return { revision, state };
  }
  async latestMain() {
    await this.initialize();
    const found = await this.git(['ls-remote', '--refs', this.remote, 'refs/heads/main']);
    const revision = found.split(/\s/)[0];
    if (!/^[a-f0-9]{40}$/.test(revision ?? '')) throw new Error('Latest main unavailable');
    await this.git(['fetch', '--no-tags', this.remote, revision]);
    return revision;
  }
  async schemaPlan(candidate, main, retained = []) {
    await this.initialize();
    for (const revision of [candidate, main, retainedSchemaProfile.baseline]) {
      if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('Invalid schema revision');
      await this.git(['fetch', '--no-tags', this.remote, revision]);
    }
    const schemaHash = async revision => createHash('sha256').update(await this.git(['show', `${revision}:packages/db/prisma/schema.prisma`], undefined, true)).digest('hex');
    return evaluateSchemaPlan({ baseline: await this.migrationsAt(retainedSchemaProfile.baseline),
      candidate: await this.migrationsAt(candidate), main: await this.migrationsAt(main), retained,
      candidateSchema: await schemaHash(candidate), mainSchema: await schemaHash(main) });
  }
  async migrationsAt(revision) {
    await this.initialize();
    if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('Invalid migration revision');
    await this.git(['fetch', '--no-tags', this.remote, revision]);
    const names = (await this.git(['ls-tree', '--name-only', `${revision}:packages/db/prisma/migrations`]))
      .split('\n').filter(x => /^\d+_[a-zA-Z0-9_]+$/.test(x)).sort();
    return Promise.all(names.map(async name => ({ name, checksum: createHash('sha256').update(
      await this.git(['show', `${revision}:packages/db/prisma/migrations/${name}/migration.sql`], undefined, true)).digest('hex') })));
  }
  async compareAndSwap(expected, state) {
    await this.initialize();
    if (expected && !/^[a-f0-9]{40}$/.test(expected)) throw new Error('Invalid coordination revision');
    const blob = await this.git(['hash-object', '-w', '--stdin'], JSON.stringify(state) + '\n');
    const tree = await this.git(['mktree'], `100644 blob ${blob}\treservation.json\n`);
    const commit = await this.git(['commit-tree', tree, ...(expected ? ['-p', expected] : []), '-m', 'Record staging control transition']);
    try {
      // Explicit expected revision, never implicit tracking state. Competing siblings cannot win.
      await this.git(['push', `--force-with-lease=${this.ref}:${expected ?? ''}`, this.remote, `${commit}:${this.ref}`]);
      return true;
    } catch {
      // A timeout may have committed remotely. Caller must inspect; never assume authority.
      return false;
    }
  }
}
