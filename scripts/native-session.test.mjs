import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  expoPublicEnv,
  missingFromBundle,
  parseArgs,
  railwayEnvironmentName,
} from "../apps/mobile/scripts/native-session.mjs";

const EAS = {
  build: {
    base: { env: { EXPO_PUBLIC_APP_VERSION: "2.0.3", EXPO_PUBLIC_CUSTOM_SCHEME: "autotm", OTHER: "x" } },
    staging: { env: { EXPO_PUBLIC_ENV: "staging", EXPO_PUBLIC_WEB_URL: "https://staging.example" } },
  },
};
const API_VARIABLES = {
  RAILWAY_PUBLIC_DOMAIN: "api-staging.example",
  MINIO_PUBLIC_URL: "https://minio-staging.example/",
  DATABASE_URL: "postgres://secret@internal/db",
};

describe("railwayEnvironmentName", () => {
  it("maps staging and PR shorthands to Railway environment names", () => {
    assert.equal(railwayEnvironmentName("staging"), "staging");
    assert.equal(railwayEnvironmentName("pr-827"), "auto.tm-rewrite-pr-827");
    assert.equal(railwayEnvironmentName("auto.tm-rewrite-pr-827"), "auto.tm-rewrite-pr-827");
  });

  it("refuses production, a missing name and anything else", () => {
    assert.throws(() => railwayEnvironmentName("production"), /production/);
    assert.throws(() => railwayEnvironmentName(undefined), /--env is required/);
    assert.throws(() => railwayEnvironmentName("local"), /Unknown --env/);
  });
});

describe("expoPublicEnv", () => {
  it("sets the API, socket and media origins from the api service and the rest from eas.json", () => {
    assert.deepEqual(expoPublicEnv(API_VARIABLES, EAS), {
      EXPO_PUBLIC_APP_VERSION: "2.0.3",
      EXPO_PUBLIC_CUSTOM_SCHEME: "autotm",
      EXPO_PUBLIC_ENV: "staging",
      EXPO_PUBLIC_WEB_URL: "https://staging.example",
      EXPO_PUBLIC_API_URL: "https://api-staging.example/api/v1",
      EXPO_PUBLIC_WS_URL: "wss://api-staging.example/ws/chat",
      EXPO_PUBLIC_MEDIA_URL: "https://minio-staging.example",
    });
  });

  it("refuses to start without a media origin, which would leave every card photo grey", () => {
    assert.throws(() => expoPublicEnv({ RAILWAY_PUBLIC_DOMAIN: "api.example" }, EAS), /MINIO_PUBLIC_URL/);
    assert.throws(
      () => expoPublicEnv({ RAILWAY_PUBLIC_DOMAIN: "api.example", MINIO_PUBLIC_URL: "http://minio.railway.internal:9000" }, EAS),
      /https MINIO_PUBLIC_URL/,
    );
    assert.throws(() => expoPublicEnv({ MINIO_PUBLIC_URL: "https://m.example" }, EAS), /RAILWAY_PUBLIC_DOMAIN/);
  });
});

describe("missingFromBundle", () => {
  const env = expoPublicEnv(API_VARIABLES, EAS);

  it("passes a bundle that carries all three origins", () => {
    const bundle = [env.EXPO_PUBLIC_API_URL, env.EXPO_PUBLIC_WS_URL, env.EXPO_PUBLIC_MEDIA_URL].join(";");
    assert.deepEqual(missingFromBundle(bundle, env), []);
  });

  it("names the origins a bundle lacks, such as a localhost fallback build", () => {
    assert.deepEqual(missingFromBundle(`"http://localhost:3006/api/v1";${env.EXPO_PUBLIC_API_URL}`, env), [
      "EXPO_PUBLIC_WS_URL",
      "EXPO_PUBLIC_MEDIA_URL",
    ]);
  });
});

describe("parseArgs", () => {
  it("reads the command, environment, simulator and port, skipping pnpm's --", () => {
    assert.deepEqual(parseArgs(["metro", "--", "--env", "staging", "--port", "8827"]), {
      command: "metro",
      env: "staging",
      port: 8827,
    });
    assert.deepEqual(parseArgs(["ios", "--udid", "ABC", "--port", "8841"]), { command: "ios", udid: "ABC", port: 8841 });
  });

  it("rejects unknown flags and a bad port", () => {
    assert.throws(() => parseArgs(["metro", "--prod"]), /Unknown option/);
    assert.throws(() => parseArgs(["metro", "--port", "x"]), /--port/);
  });
});

for (const args of [["metro", "--env", "staging"], ["ios", "--udid", "ABC"], ["metro", "--port", "65536"], ["metro", "--port"]]) {
  it(`requires an explicit valid port: ${args.join(" ")}`, () => {
    assert.throws(() => parseArgs(args), /--port/);
  });
}
it("rejects media origins carrying credentials or query values", () => {
  for (const media of ["https://user:secret@media.example", "https://media.example/?secret=value"]) {
    assert.throws(() => expoPublicEnv({ ...API_VARIABLES, MINIO_PUBLIC_URL: media }, EAS), /MINIO_PUBLIC_URL/);
  }
});
