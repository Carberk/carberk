import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { richTarget } from "./rich-target";

const env = { APP_ENV: "test", NODE_ENV: "test", DATABASE_URL: "postgres://test:private@localhost:5432/test",
  MINIO_ENDPOINT: "http://localhost:9000", MINIO_PUBLIC_URL: "http://localhost:9000", MINIO_ACCESS_KEY: "test", MINIO_SECRET_KEY: "private" };
const args = ["--target", "local", "--mode", "plan", "--owner-id", "existing-seller"];
describe("explicit local rich scenario operator", () => {
  it("requires existing video access and an explicit distinct viewer without changing photo guards", () => {
    const videoArgs = [...args, "--scenario-set", "videos", "--viewer-id", "existing-viewer"];
    expect(() => richTarget(videoArgs, env)).toThrow("LISTING_VIDEO_UPLOADS_ENABLED");
    const videoEnv = { ...env, REDIS_URL: "redis://localhost:6379", LISTING_VIDEO_API_ORIGIN: "http://localhost:3006",
      LISTING_VIDEO_UPLOADS_ENABLED: "true", LISTING_VIDEO_UPLOAD_TESTER_USER_IDS: "existing-seller",
      LISTING_VIDEO_VIEW_TESTER_USER_IDS: "existing-seller,existing-viewer", LISTING_VIDEO_BUCKET_ENDPOINT: "http://localhost:9000",
      LISTING_VIDEO_BUCKET_NAME: "listing-videos", LISTING_VIDEO_BUCKET_ACCESS_KEY_ID: "test", LISTING_VIDEO_BUCKET_SECRET_ACCESS_KEY: "private" };
    expect(richTarget(videoArgs, videoEnv).scenarioSet).toBe("videos");
    expect(richTarget(videoArgs, { ...videoEnv, LISTING_VIDEO_VIEW_TESTER_USER_IDS: "existing-seller" }).scenarioSet).toBe("videos");
    const asymmetric = { ...videoEnv, LISTING_VIDEO_BUCKET_REGION: "auto" };
    expect(richTarget(videoArgs, videoEnv, asymmetric).video?.configFingerprint).not.toBe(richTarget(videoArgs, videoEnv).video?.configFingerprint);
    expect(() => richTarget(videoArgs, videoEnv, { ...asymmetric, MINIO_SECRET_KEY: "different", LISTING_VIDEO_BUCKET_SECRET_ACCESS_KEY: "different" })).toThrow("identity mismatch");
    for (const overrides of [{ LISTING_VIDEO_UPLOADS_ENABLED: "false" }, { LISTING_VIDEO_VIEW_TESTER_USER_IDS: "existing-viewer" },
      { LISTING_VIDEO_BUCKET_ENDPOINT: "https://remote.invalid" }, { REDIS_URL: "redis://remote.invalid" }]) {
      expect(() => richTarget(videoArgs, { ...videoEnv, ...overrides })).toThrow();
    }
    expect(() => richTarget([...args, "--scenario-set", "videos", "--viewer-id", "existing-seller"], videoEnv)).toThrow("distinct");
  });
  it("pins localhost and requires an explicit non-destructive mode/owner", () => {
    expect(richTarget(args, env).endpoint).toBe("http://127.0.0.1:9000/");
    expect(richTarget(args, { ...env, RAILWAY_HOME: "/local/cli" }).mode).toBe("plan");
    for (const input of [[], ["--target", "local"], ["--target", "local", "--mode", "reset"], args.slice(0, 4)]) {
      expect(() => richTarget(input, env)).toThrow();
    }
    expect(() => richTarget([...args.slice(0, 3), "apply", ...args.slice(4)], env)).toThrow("--plan-hash");
  });
  it.each([
    { APP_ENV: "production" }, { NODE_ENV: "production" }, { RAILWAY_PROJECT_ID: "project" },
    { DATABASE_URL: "postgres://test:private@db.railway.internal/test" },
    { DATABASE_URL: "postgres://test:private@localhost/test?host=remote" },
    { DATABASE_URL: "postgres://test:private@localhost/test#remote" },
    { MINIO_ENDPOINT: "https://remote.invalid" }, { MINIO_PUBLIC_URL: "http://remote.invalid" },
    { MINIO_ENDPOINT: "http://localhost:9000/bucket" }, { MINIO_PUBLIC_URL: "http://user:pass@localhost:9000" },
  ])("refuses deployed or overridden targets without exposing values: %j", (overrides) => {
    expect(() => richTarget(args, { ...env, ...overrides })).toThrow();
    try { richTarget(args, { ...env, ...overrides }); } catch (error) { expect(String(error)).not.toContain("private"); }
  });
  it("the actual entrypoint refuses before trying unavailable clients", () => {
    expect(() => execFileSync(process.execPath, ["--import", "tsx", "scripts/rich-scenarios.ts", ...args], {
      env: { ...process.env, ...env, RAILWAY_PROJECT_ID: "refused" }, stdio: "pipe",
    })).toThrow(/Rich scenarios require local/);
  });
});
