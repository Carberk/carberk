import { parseArgs } from "node:util";

/** Pure, before importing clients: no remote fallback or driver URL overrides. */
export function richTarget(args: string[], env: NodeJS.ProcessEnv) {
  const { values } = parseArgs({ args, options: {
    target: { type: "string" }, mode: { type: "string" }, "owner-id": { type: "string" },
    "plan-hash": { type: "string" }, "scenario-set": { type: "string", default: "photos" },
  } });
  if (values.target !== "local" || !["check", "plan", "apply"].includes(values.mode ?? "")) {
    throw new Error("Require --target local --mode check|plan|apply");
  }
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(values["owner-id"] ?? "")) throw new Error("Require explicit existing --owner-id");
  if (!["photos", "private-drafts"].includes(values["scenario-set"] ?? "")) throw new Error("Require --scenario-set photos|private-drafts");
  if (!["development", "test"].includes(env["APP_ENV"] ?? "") || !["development", "test"].includes(env["NODE_ENV"] ?? "") ||
      ["RAILWAY_ENVIRONMENT_ID", "RAILWAY_ENVIRONMENT_NAME", "RAILWAY_PROJECT_ID", "RAILWAY_SERVICE_ID"].some((key) => env[key])) {
    throw new Error("Rich scenarios require local development/test, outside Railway");
  }
  const local = (key: string, protocols: string[], bare: boolean) => {
    let url: URL;
    try { url = new URL(env[key] ?? ""); } catch { throw new Error(`${key}: require explicit loopback URL`); }
    if (!protocols.includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.search || url.hash ||
        (bare && (url.username || url.password || url.pathname !== "/"))) throw new Error(`${key}: require unmodified loopback target`);
    if (url.hostname === "localhost") url.hostname = "127.0.0.1";
    return url.href;
  };
  const databaseUrl = local("DATABASE_URL", ["postgres:", "postgresql:"], false);
  const endpoint = local("MINIO_ENDPOINT", ["http:"], true);
  const publicUrl = local("MINIO_PUBLIC_URL", ["http:"], true);
  if (!env["MINIO_ACCESS_KEY"] || !env["MINIO_SECRET_KEY"]) throw new Error("Require local storage credentials");
  if (values.mode === "apply" && !/^[a-f0-9]{64}$/.test(values["plan-hash"] ?? "")) throw new Error("Apply requires --plan-hash from plan");
  return { mode: values.mode as "check" | "plan" | "apply", ownerId: values["owner-id"] ?? "",
    scenarioSet: values["scenario-set"] as "photos" | "private-drafts",
    planHash: values["plan-hash"], databaseUrl, endpoint, publicUrl,
    accessKeyId: env["MINIO_ACCESS_KEY"], secretAccessKey: env["MINIO_SECRET_KEY"] };
}
