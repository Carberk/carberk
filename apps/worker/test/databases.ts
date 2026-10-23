export interface WorkerTestDatabases { baseDatabaseUrl: string; prefix: string; workers: number; }
declare module "vitest" { interface ProvidedContext { workerTestDatabases: WorkerTestDatabases | undefined; } }

export function withDatabase(url: string, name: string): string { const parsed = new URL(url); parsed.pathname = `/${name}`; return parsed.toString(); }
export const workerDatabaseName = (prefix: string, worker: number): string => `${prefix}_w${worker}`;
