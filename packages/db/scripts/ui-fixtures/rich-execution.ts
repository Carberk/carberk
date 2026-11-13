import type { richTarget } from "./rich-target";

export type RichQuery = (sql: string, values?: unknown[]) => Promise<Record<string, unknown>[]>;
export type RichAuthorization = (report: { version: string; planHash: string; state: string }, query: RichQuery) => Promise<void>;
// The local parser remains the sole authority for local callers. Only the
// separate deployed entrypoint supplies this transaction-bound authorization.
export type RichExecutionTarget = ReturnType<typeof richTarget> & { authorize?: RichAuthorization };
