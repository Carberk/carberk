#!/usr/bin/env node
/**
 * Integrated reviewer-flow smoke against a deployed AutoTM environment.
 *
 * Proves, in one pass and against real HTTP/WebSocket/S3 surfaces, the
 * store-review path required by issue #279: two distinct reserved reviewer
 * accounts authenticate through the ADR-0030 OTP bypass while general signup
 * is disabled, browse and create a listing, exchange rich chat, report and
 * block, and an elevated admin moderates the report with the ban visible to
 * anonymous readers.
 *
 * Secret hygiene is the point of the credentials file: reviewer codes, the
 * admin TOTP secret, and the admin refresh token live only in a local 0600
 * JSON file. Nothing in this script prints a credential, a token, or a phone
 * number — only check names, status codes, roles, identifiers, timings, and
 * PASS/FAIL. Run it with its output going anywhere; it stays secret-free.
 *
 * Usage:
 *   SMOKE_CREDENTIALS_FILE=~/.autotm-ops/staging/smoke-credentials.json \
 *     node scripts/staging-reviewer-flow-smoke.mjs
 *
 *   # Two-step signup-gate probe: step 1 asks for a code, the operator reads
 *   # it from the API's mock-SMS log line, step 2 proves the gate rejects it.
 *   node scripts/staging-reviewer-flow-smoke.mjs signup-probe-request
 *   printf '%s' <code> | node scripts/staging-reviewer-flow-smoke.mjs signup-probe-verify
 *
 * Credentials file shape:
 *   {
 *     "apiUrl": "https://<api host>",
 *     "reviewerAccounts": [{ "phone": "+993...", "code": "NNNNNN" }, ...],
 *     "admin": { "phone": "+993...", "totpSecret": "BASE32", "refreshToken": "..." },
 *     "signupProbePhone": "+993..."
 *   }
 */

import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { createHmac, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

// Resolved through apps/mobile's package rather than a root dependency, on
// purpose: the harness should drive the flow with the exact Socket.IO client
// the shipped app uses, and this survives pnpm-workspace.yaml's shamefullyHoist being
// turned off or Expo re-aligning the mobile dependency set.
const { io } = createRequire(new URL("../apps/mobile/package.json", import.meta.url))(
  "socket.io-client",
);

const { ListingsSchemas } = createRequire(new URL("../packages/contracts/package.json", import.meta.url))("@auto-tm/contracts");

// The one identifier this harness has to know: the reviewer scenario's primary
// seeded listing, from packages/db/src/reviewer-scenario-seed.ts. Everything
// else the flow needs — brand, model, region, city — is read back off that
// listing rather than copied here, so the catalogue ids can never drift out of
// sync with the seed and the read itself proves the catalogue is reachable.
const SEEDED_PRIMARY_LISTING_ID = "e042b037-1e59-495d-8380-e497ad7d035e";

const results = [];
let failed = false;
// Errors check() has already turned into a FAIL row. Anything thrown outside a
// check() is absent from this set and must still reach the summary.
const recordedFailures = new WeakSet();

function expandHome(p) {
  return p.startsWith("~/") ? p.replace("~", homedir()) : p;
}

function loadCredentials() {
  const path = expandHome(
    process.env["SMOKE_CREDENTIALS_FILE"] ?? "~/.autotm-ops/staging/smoke-credentials.json",
  );
  return { path, credentials: JSON.parse(readFileSync(path, "utf8")) };
}

function saveCredentials(path, credentials) {
  writeFileSync(path, JSON.stringify(credentials, null, 2), { mode: 0o600 });
  // `mode` only applies when writeFileSync creates the file. This file already
  // exists on every run after the first, so tighten it explicitly.
  chmodSync(path, 0o600);
}

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failed = true;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

export function formatDetail(detail, elapsedMs) {
  return detail ? `${detail}, ${elapsedMs}ms` : `${elapsedMs}ms`;
}

async function check(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    record(name, true, formatDetail(detail, Date.now() - started));
  } catch (err) {
    record(name, false, `${err instanceof Error ? err.message : String(err)} (${Date.now() - started}ms)`);
    if (err instanceof Object) recordedFailures.add(err);
    throw err;
  }
}

/** Minimal JSON HTTP client. Never logs bodies — callers decide what to report. */
async function request(baseUrl, method, path, { token, body, headers } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

function expectStatus(res, expected, what) {
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (!allowed.includes(res.status)) {
    // GlobalErrorFilter's envelope is flat: { statusCode, code, message, details }.
    // It carries a code but never a secret value.
    const code = res.json?.code;
    throw new Error(`${what}: expected ${allowed.join("|")}, got ${res.status}${code ? ` (${code})` : ""}`);
  }
  return res.json;
}

/** RFC 6238 TOTP, so the admin elevation step needs no authenticator app. */
export function base32Decode(input) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = input.replace(/=+$/, "").toUpperCase().replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const out = [];
  for (const char of clean) {
    const index = alphabet.indexOf(char);
    if (index === -1) throw new Error("Invalid base32 character in TOTP secret");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function totp(secret, atMs = Date.now()) {
  const counter = Math.floor(atMs / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const digest = createHmac("sha1", base32Decode(secret)).update(buf).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

async function signIn(apiUrl, account) {
  const res = await request(apiUrl, "POST", "/api/v1/auth/otp/verify", {
    body: { phone: account.phone, code: account.code },
  });
  const body = expectStatus(res, [200, 201], "reviewer sign-in");
  return {
    accessToken: body.accessToken,
    refreshToken: body.refreshToken,
    userId: body.user.id,
    role: body.user.role,
    // Kept for the Listing contact phone, never printed.
    phone: account.phone,
  };
}

/**
 * A complete draft for the seller's smoke listing. The contact phone is the
 * seller's own sign-in phone, which publish accepts without a code (ADR-0081).
 */
export function smokeDraftBody({ catalogue, photoKeys, sellerPhone, now }) {
  return {
    ...catalogue,
    year: 2019,
    condition: "used",
    mileageKm: 84000,
    priceAmount: 155000,
    priceCurrency: "TMT",
    description: `Reviewer smoke listing ${now.toISOString()}`,
    contactPhone: sellerPhone,
    allowCalls: true,
    allowChat: true,
    conditionDisclosure: { damaged: false },
    acceptsExchange: false,
    installmentAvailable: false,
    photos: photoKeys.map((key, sortOrder) => ({ photoId: randomUUID(), key, sortOrder })),
  };
}

/** A 1x1 JPEG. Real bytes, so the signed PUT and the media read are real. */
const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
    "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA" +
    "AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64",
);

async function uploadSignedImage(apiUrl, token, presignPath, extraBody = {}) {
  const presign = expectStatus(
    await request(apiUrl, "POST", presignPath, {
      token,
      body: { contentType: "image/jpeg", sizeBytes: TINY_JPEG.length,
        ...(presignPath === "/api/v1/uploads/presign" ? { writeProtocol: "conditional-v1" } : {}),
        ...extraBody },
    }),
    [200, 201],
    "presign",
  );
  const put = await fetch(presign.uploadUrl, {
    method: "PUT",
    headers: presign.headers ?? { "content-type": "image/jpeg" },
    body: TINY_JPEG,
  });
  if (put.status !== 200) throw new Error(`signed PUT returned ${put.status}`);
  return presign.key;
}

function connectChat(apiUrl, token) {
  return new Promise((resolve, reject) => {
    const socket = io(`${apiUrl}/ws/chat`, {
      transports: ["websocket"],
      auth: { token },
      reconnection: false,
      timeout: 15000,
    });
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error("WebSocket connect timed out"));
    }, 15000);
    socket.on("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.on("connect_error", (err) => {
      clearTimeout(timer);
      reject(new Error(`WebSocket connect_error: ${err.message}`));
    });
  });
}

function emitWithAck(socket, event, payload, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} ack timed out`)), timeoutMs);
    socket.emit(event, payload, (ack) => {
      clearTimeout(timer);
      if (!ack || ack.ok !== true) {
        reject(new Error(`${event} rejected: ${ack?.code ?? "no ack"}`));
        return;
      }
      resolve(ack);
    });
  });
}

function waitForEvent(socket, event, predicate, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`${event} not received within ${timeoutMs}ms`));
    }, timeoutMs);
    function handler(payload) {
      if (predicate(payload)) {
        clearTimeout(timer);
        socket.off(event, handler);
        resolve(payload);
      }
    }
    socket.on(event, handler);
  });
}

// ── Signup-gate probe (two-step; the code comes from the API's mock-SMS log) ──

async function signupProbeRequest() {
  const { credentials } = loadCredentials();
  const phone = credentials.signupProbePhone;
  if (!phone) throw new Error("signupProbePhone missing from the credentials file");
  const res = await request(credentials.apiUrl, "POST", "/api/v1/auth/otp/request", {
    body: { phone },
  });
  expectStatus(res, [200, 201], "signup probe OTP request");
  // The mock-SMS log line carries the phone's last four digits and the start
  // of this request's id, so two phones that share their last four still grep
  // apart. Keep in step with requestTag in apps/api's HttpOtpSenderAdapter.
  const requestId = res.json?.requestId;
  if (typeof requestId !== "string" || requestId.length < 8) {
    throw new Error("signup probe OTP request returned no requestId");
  }
  console.log(
    "PASS  signup-probe-request — OTP issued for an unreserved number; " +
      `grep the API mock-SMS log for 'mock] OTP for \\*\\*\\*${phone.slice(-4)} (req ${requestId.slice(0, 8)}):' ` +
      "and pipe that line's code into signup-probe-verify",
  );
}

async function readCodeFromStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const code = Buffer.concat(chunks).toString("utf8").trim();
  if (!/^\d{6}$/.test(code)) throw new Error("expected a 6-digit code on stdin");
  return code;
}

async function signupProbeVerify() {
  // The code arrives on stdin rather than argv: argv lands in shell history
  // and in `ps` output, and this is a live (if single-use) credential.
  const code = await readCodeFromStdin();
  const { credentials } = loadCredentials();
  const res = await request(credentials.apiUrl, "POST", "/api/v1/auth/otp/verify", {
    body: { phone: credentials.signupProbePhone, code },
  });
  const reason = res.json?.details?.reason;
  const ok = res.status === 403 && reason === "FEATURE_DISABLED";
  record(
    "signup gate rejects a correct code for an unreserved number",
    ok,
    `status=${res.status} reason=${reason ?? "none"}`,
  );
  process.exit(ok ? 0 : 1);
}

// ── The integrated reviewer flow ──

async function main() {
  const { path: credentialsPath, credentials } = loadCredentials();
  const apiUrl = credentials.apiUrl;
  const accounts = credentials.reviewerAccounts ?? [];
  if (accounts.length < 2) throw new Error("At least two reviewer accounts are required");

  console.log(`Reviewer-flow smoke against ${apiUrl}`);
  const health = expectStatus(await request(apiUrl, "GET", "/healthz"), 200, "healthz");
  console.log(`commitSha=${health.commitSha} environment=${health.environment}`);
  expectStatus(await request(apiUrl, "GET", "/readyz"), 200, "readyz");

  const sockets = [];
  let seller = null;
  let buyer = null;
  let publishedListingId = null;
  let conversationId = null;
  let reportId = null;
  let admin = null;

  try {
    // 1 — two distinct reserved accounts authenticate through the bypass
    const signedIn = [];
    await check("two distinct reserved accounts authenticate", async () => {
      for (const account of accounts) {
        signedIn.push(await signIn(apiUrl, account));
      }
      seller = signedIn.find((s) => s.role === "seller");
      buyer = signedIn.find((s) => s.role === "buyer" && s.userId !== seller?.userId);
      if (!seller || !buyer) throw new Error("need one seller and one distinct buyer");
      if (signedIn.some((s) => s.role === "admin")) throw new Error("bypass elevated an admin");
      const ids = new Set(signedIn.map((s) => s.userId));
      if (ids.size !== signedIn.length) throw new Error("reviewer accounts are not distinct");
      return `${signedIn.length} accounts, roles=${signedIn.map((s) => s.role).join("/")}`;
    });

    // 2 — browse. The seeded listing's detail doubles as the catalogue source
    // for check 3, so a drifted seed fails here rather than deep in publishing.
    let catalogue = null;
    await check("browse: authenticated feed and anonymous listing detail", async () => {
      const feed = expectStatus(
        await request(apiUrl, "GET", "/api/v1/listings?limit=20", { token: buyer.accessToken }),
        200,
        "listing feed",
      );
      const detail = expectStatus(
        await request(apiUrl, "GET", `/api/v1/listings/${SEEDED_PRIMARY_LISTING_ID}`),
        200,
        "seeded listing detail",
      );
      catalogue = {
        brandId: detail.brandId,
        modelId: detail.modelId,
        regionId: detail.regionId,
        cityId: detail.cityId,
      };
      for (const [field, value] of Object.entries(catalogue)) {
        if (!value) throw new Error(`seeded listing has no ${field}`);
      }
      return `feed items=${feed.items?.length ?? 0}, seeded listing status=${detail.status}`;
    });

    // 3 — the seller creates and publishes a listing through the real wizard path
    await check("seller creates a listing (signed upload → draft → publish)", async () => {
      const photoKeys = [];
      for (let i = 0; i < ListingsSchemas.MIN_LISTING_PHOTOS; i++) {
        photoKeys.push(await uploadSignedImage(apiUrl, seller.accessToken, "/api/v1/uploads/presign", { kind: "image" }));
      }
      const draft = expectStatus(
        await request(apiUrl, "POST", "/api/v1/listings/drafts", {
          token: seller.accessToken,
          body: {},
        }),
        [200, 201],
        "create draft",
      );
      expectStatus(
        await request(apiUrl, "PATCH", `/api/v1/listings/drafts/${draft.id}`, {
          token: seller.accessToken,
          body: smokeDraftBody({
            catalogue,
            photoKeys,
            sellerPhone: seller.phone,
            now: new Date(),
          }),
        }),
        200,
        "update draft",
      );
      const published = expectStatus(
        await request(apiUrl, "POST", `/api/v1/listings/drafts/${draft.id}/publish`, {
          token: seller.accessToken,
          body: {},
        }),
        [200, 201],
        "publish draft",
      );
      publishedListingId = published.id;
      if (!publishedListingId) throw new Error("publish returned no listing id");
      expectStatus(
        await request(apiUrl, "GET", `/api/v1/listings/${publishedListingId}`),
        200,
        "published listing is publicly readable",
      );
      return `listingId=${publishedListingId}`;
    });

    // 4 — rich chat between the two distinct accounts, over the real socket
    await check("rich chat: text over WebSocket and an image message", async () => {
      const opened = expectStatus(
        await request(apiUrl, "POST", "/api/v1/conversations", {
          token: buyer.accessToken,
          body: { listingId: publishedListingId },
        }),
        [200, 201],
        "open conversation",
      );
      conversationId = opened.id;
      if (!conversationId) throw new Error("open conversation returned no id");

      const buyerSocket = await connectChat(apiUrl, buyer.accessToken);
      const sellerSocket = await connectChat(apiUrl, seller.accessToken);
      sockets.push(buyerSocket, sellerSocket);
      await emitWithAck(buyerSocket, "conversation:join", { conversationId });
      await emitWithAck(sellerSocket, "conversation:join", { conversationId });

      const clientMessageId = randomUUID();
      const delivered = waitForEvent(
        sellerSocket,
        "message:new",
        (payload) => payload?.message?.conversationId === conversationId,
      );
      await emitWithAck(buyerSocket, "message:send", {
        conversationId,
        kind: "text",
        text: "Reviewer smoke: is this car still available?",
        clientMessageId,
      });
      const textEvent = await delivered;

      // Image message. The mobile app sends images over HTTP
      // (POST /messages/rich), and that path persists the message and fires
      // the push event but does NOT broadcast message:new — only the socket
      // handler does. Both are exercised here: the image goes over the socket
      // so realtime delivery is provable, and the HTTP rich endpoint is
      // exercised separately and asserted through message history.
      const imageDelivered = waitForEvent(
        buyerSocket,
        "message:new",
        (payload) => payload?.message?.kind === "image",
      );
      const attachmentKey = await uploadSignedImage(
        apiUrl,
        seller.accessToken,
        `/api/v1/conversations/${conversationId}/attachments/presign`,
      );
      await emitWithAck(sellerSocket, "message:send", {
        conversationId,
        kind: "image",
        metadata: { key: attachmentKey },
        clientMessageId: randomUUID(),
      });
      const imageEvent = await imageDelivered;

      const httpImageKey = await uploadSignedImage(
        apiUrl,
        seller.accessToken,
        `/api/v1/conversations/${conversationId}/attachments/presign`,
      );
      const httpImage = expectStatus(
        await request(apiUrl, "POST", `/api/v1/conversations/${conversationId}/messages/rich`, {
          token: seller.accessToken,
          body: { kind: "image", metadata: { key: httpImageKey }, clientMessageId: randomUUID() },
        }),
        [200, 201],
        "send image message over HTTP",
      );

      const history = expectStatus(
        await request(apiUrl, "GET", `/api/v1/conversations/${conversationId}/messages?limit=50`, {
          token: buyer.accessToken,
        }),
        200,
        "message history",
      );
      const kinds = new Set((history.items ?? []).map((m) => m.kind));
      if (!kinds.has("text") || !kinds.has("image")) {
        throw new Error(`history missing kinds, saw ${[...kinds].join(",") || "none"}`);
      }
      const ids = new Set((history.items ?? []).map((m) => m.id));
      for (const [label, id] of [["socket text", textEvent.message.id], ["socket image", imageEvent.message.id], ["http image", httpImage.id]]) {
        if (!ids.has(id)) throw new Error(`${label} message is missing from history`);
      }
      return `conversationId=${conversationId}, socket text+image delivered, http image persisted`;
    });

    // 5 — report and block
    await check("buyer reports the listing and blocks the seller", async () => {
      const report = expectStatus(
        await request(apiUrl, "POST", `/api/v1/listings/${publishedListingId}/report`, {
          token: buyer.accessToken,
          body: { reason: "misleading", details: "Reviewer smoke report" },
        }),
        [200, 201],
        "create report",
      );
      reportId = report.reportId;

      expectStatus(
        await request(apiUrl, "POST", "/api/v1/me/blocked-users", {
          token: buyer.accessToken,
          body: { userId: seller.userId },
        }),
        [200, 201],
        "block seller",
      );
      const blocked = expectStatus(
        await request(apiUrl, "GET", `/api/v1/me/blocked-users/${seller.userId}`, {
          token: buyer.accessToken,
        }),
        200,
        "block state",
      );
      if (blocked.blocked !== true) throw new Error("block did not take effect");
      // Leave the environment as it was found: the block is proven, then undone.
      expectStatus(
        await request(apiUrl, "DELETE", `/api/v1/me/blocked-users/${seller.userId}`, {
          token: buyer.accessToken,
        }),
        200,
        "unblock seller",
      );
      return `reportId=${reportId}, status=${report.status}, block asserted and released`;
    });

    // 6 — live admin moderation and public enforcement
    if (!credentials.admin?.refreshToken || !credentials.admin?.totpSecret) {
      record(
        "live admin moderation and public enforcement",
        false,
        "credentials file has no admin refreshToken/totpSecret — run the admin bootstrap first",
      );
    } else {
      await check("admin session refresh and TOTP elevation", async () => {
        const refreshed = expectStatus(
          await request(apiUrl, "POST", "/api/v1/auth/refresh", {
            body: { refreshToken: credentials.admin.refreshToken },
          }),
          [200, 201],
          "admin refresh",
        );
        // POST /auth/refresh returns tokens only, so the role comes from /me.
        const me = expectStatus(
          await request(apiUrl, "GET", "/api/v1/me", { token: refreshed.accessToken }),
          200,
          "admin identity",
        );
        admin = { accessToken: refreshed.accessToken, userId: me.id, role: me.role };
        if (admin.role !== "admin") throw new Error(`refreshed session role is ${admin.role}`);
        // Refresh tokens rotate; persist the new one so the next run works.
        credentials.admin.refreshToken = refreshed.refreshToken;
        saveCredentials(credentialsPath, credentials);

        expectStatus(
          await request(apiUrl, "POST", "/api/v1/auth/admin/totp/verify", {
            token: admin.accessToken,
            body: { code: totp(credentials.admin.totpSecret) },
          }),
          [200, 201],
          "admin TOTP verify",
        );
        const status = expectStatus(
          await request(apiUrl, "GET", "/api/v1/auth/admin/totp/status", { token: admin.accessToken }),
          200,
          "admin TOTP status",
        );
        if (status.enrolled !== true || status.elevated !== true) {
          throw new Error(
            `admin TOTP status: enrolled=${status.enrolled}, elevated=${status.elevated}`,
          );
        }
        return "role=admin, enrolled, elevated";
      });

      await check("admin sees the report and bans the listing", async () => {
        const queue = expectStatus(
          await request(apiUrl, "GET", "/api/v1/admin/reports?status=pending&limit=50", {
            token: admin.accessToken,
          }),
          200,
          "admin report queue",
        );
        const found = (queue.items ?? []).some((report) => report.id === reportId);
        if (!found) throw new Error("the report just filed is not in the pending queue");

        const ban = expectStatus(
          await request(apiUrl, "POST", `/api/v1/admin/listings/${publishedListingId}/ban`, {
            token: admin.accessToken,
            body: { reason: "Reviewer smoke: moderation proof", reportId },
          }),
          200,
          "ban listing",
        );
        return `reportStatus=${ban.reportStatus ?? "n/a"}, auditLogId=${ban.auditLogId}`;
      });

      await check("ban is enforced for anonymous readers", async () => {
        const detail = await request(apiUrl, "GET", `/api/v1/listings/${publishedListingId}`);
        if (detail.status === 200) throw new Error("a banned listing is still publicly readable");
        const feed = expectStatus(
          await request(apiUrl, "GET", "/api/v1/listings?limit=50", { token: buyer.accessToken }),
          200,
          "feed after ban",
        );
        if ((feed.items ?? []).some((l) => l.id === publishedListingId)) {
          throw new Error("a banned listing is still in the feed");
        }
        return `anonymous detail status=${detail.status}, absent from feed`;
      });
    }
  } catch (err) {
    // check() already recorded whatever it caught. A throw from between checks
    // (credential load, socket setup) was never recorded, and without this row
    // it would disappear into an "N/M checks passed" line with no FAIL.
    if (!(err instanceof Object) || !recordedFailures.has(err)) {
      record(
        "smoke run aborted between checks",
        false,
        err instanceof Error ? err.message : String(err),
      );
    }
  } finally {
    for (const socket of sockets) socket.close();
    // Leave the reviewer scenario as it was found. A completed run ends with
    // the listing banned and therefore invisible; a run that fails partway
    // would otherwise leave a live smoke listing in the reviewer feed.
    if (publishedListingId && seller) {
      const detail = await request(apiUrl, "GET", `/api/v1/listings/${publishedListingId}`);
      if (detail.status === 200) {
        const archived = await request(apiUrl, "POST", `/api/v1/listings/${publishedListingId}/archive`, {
          token: seller.accessToken,
          body: {},
        });
        console.log(`cleanup: archived the smoke listing (status=${archived.status})`);
      }
    }
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

const [, , subcommand] = process.argv;
const run =
  subcommand === "signup-probe-request"
    ? signupProbeRequest
    : subcommand === "signup-probe-verify"
      ? signupProbeVerify
      : main;

if (invokedDirectly) {
  run().catch((err) => {
    console.error(`smoke aborted: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
