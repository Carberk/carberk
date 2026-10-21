// S1 RED checkpoint stub: behavior lands in the GREEN commit.
const pending = () => { throw new Error('S1 pending'); };
export const PRODUCTION_RESET = Object.freeze({ open: false, environmentId: null });
export const PHASES = Object.freeze([]);
export const QUEUES = Object.freeze([]);
export const GRANT_ISSUERS = Object.freeze([]);
export const GRANT_WINDOW_SECONDS = 0;
export const parseRequest = pending;
export const guardTarget = pending;
export const grantWindowSeconds = pending;
export const evaluateQuiescence = pending;
export const evaluateWindow = pending;
export const planTables = pending;
export const nextPhase = pending;
