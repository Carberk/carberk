// S2A remote seam for the prelaunch clean reset (#901). Inert scaffold: it
// validates the fixed command and in-container identity, then refuses. It
// performs no SQL, Redis, object or platform call. The executor is unreviewed
// future work; the operator CLI remains default closed.

/** Serialized into one fixed remote Node process. There is no arbitrary shell/SQL input. */
export function cleanResetProgram(payload) {
  return `(${cleanResetMain.toString()})(${JSON.stringify(payload)})`;
}

function cleanResetMain(input) {
  try {
    const refuse = () => { throw new Error('Clean reset refused: target'); };
    const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    const exact = (value, keys) => record(value) && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
    const id = /^[a-zA-Z0-9-]{1,80}$/; const hex32 = /^[a-f0-9]{32}$/; const hex64 = /^[a-f0-9]{64}$/; const sha = /^[a-f0-9]{40}$/;
    const keys = { inventoried: ['operation', 'phase', 'operationId', 'reservationId', 'candidate', 'identity'],
      rows: ['operation', 'phase', 'operationId', 'reservationId', 'candidate', 'identity', 'expectedInventory'] };
    if (!record(input) || !Object.hasOwn(keys, input.phase) || !exact(input, keys[input.phase]) || input.operation !== 'clean-reset' ||
        !hex32.test(input.operationId) || !hex32.test(input.reservationId) || !sha.test(input.candidate)) refuse();
    if (input.phase === 'rows' && (!exact(input.expectedInventory, ['retained', 'disposable']) ||
        !hex64.test(input.expectedInventory.retained) || !hex64.test(input.expectedInventory.disposable))) refuse();
    const p = input.identity;
    if (!exact(p, ['projectId', 'environmentId', 'services', 'origins']) || !exact(p.services, ['api', 'worker']) || !exact(p.origins, ['database']) ||
        ![p.projectId, p.environmentId, p.services.api, p.services.worker].every(x => typeof x === 'string' && id.test(x)) ||
        typeof p.origins.database !== 'string') refuse();
    const e = process.env;
    if (e.RAILWAY_PROJECT_ID !== p.projectId || e.RAILWAY_ENVIRONMENT_ID !== p.environmentId || e.RAILWAY_SERVICE_ID !== p.services.api ||
        e.RAILWAY_ENVIRONMENT_NAME !== 'staging' || e.APP_ENV !== 'staging' || e.AUTOTM_COMMIT_SHA !== input.candidate) refuse();
    let db;
    try { db = new URL(e.DATABASE_URL); } catch { refuse(); }
    if (!['postgres:', 'postgresql:'].includes(db.protocol) || db.hostname !== 'postgres.railway.internal' || db.search || db.hash) refuse();
    db.username = ''; db.password = '';
    if (db.toString().replace(/\/$/, '') !== p.origins.database) refuse();
    throw new Error('Clean reset executor not implemented');
  } catch (error) {
    const message = typeof error?.message === 'string' && /^Clean reset (refused: .+|executor not implemented)$/.test(error.message)
      ? error.message : 'Clean reset refused or incomplete; diagnostics suppressed';
    console.error(message);
    process.exitCode = 1;
  }
}
