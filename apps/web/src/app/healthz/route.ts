








export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json({
    status: "ok",
    service: "web",
    commitSha: process.env["AUTOTM_COMMIT_SHA"] ?? "unknown",
    environment:
      process.env["RAILWAY_ENVIRONMENT_NAME"] ??
      process.env["APP_ENV"] ??
      "development",
  });
}
