import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";

// Exercise the CLI against the storage HTTP boundary, including SDK XML parsing.
// This fixture does not establish Railway compatibility; the live probe does.
async function runProbe(t, fault) {
  const objects = new Map();
  const parts = new Map();
  let multipartKey;
  let open = false;
  let interrupted = false;
  const etag = (body) => `"${createHash("md5").update(body).digest("hex")}"`;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const key = decodeURIComponent(url.pathname.slice("/fixture/".length));
    const query = url.searchParams;
    const xml = (body, status = 200) => {
      res.writeHead(status, { "content-type": "application/xml" });
      res.end(body);
    };
    const fail = (code, status) => xml(`<Error><Code>${code}</Code></Error>`, status);
    if (query.has("versioning")) return xml("<VersioningConfiguration/>");
    if (query.has("uploads") && req.method === "GET") {
      return xml(`<ListMultipartUploadsResult><IsTruncated>false</IsTruncated>${open
        ? `<Upload><Key>${multipartKey}</Key><UploadId>upload-1</UploadId></Upload>` : ""}</ListMultipartUploadsResult>`);
    }
    if (query.has("list-type")) {
      return xml(`<ListBucketResult><IsTruncated>false</IsTruncated>${[...objects.keys()]
        .map((name) => `<Contents><Key>${name}</Key></Contents>`).join("")}</ListBucketResult>`);
    }
    if (query.has("uploads") && req.method === "POST") {
      multipartKey = key;
      open = true;
      return xml("<InitiateMultipartUploadResult><UploadId>upload-1</UploadId></InitiateMultipartUploadResult>");
    }
    if (query.has("uploadId") && req.method === "DELETE") {
      open = false;
      res.writeHead(204).end();
      return;
    }
    if (query.has("uploadId") && req.method === "GET") {
      return xml(`<ListPartsResult><IsTruncated>false</IsTruncated>${[...parts.entries()]
        .map(([number, body]) => `<Part><PartNumber>${number}</PartNumber><ETag>${etag(body).replaceAll('"', "&quot;")}</ETag></Part>`)
        .join("")}</ListPartsResult>`);
    }
    const chunks = [];
    try {
      for await (const chunk of req) chunks.push(chunk);
    } catch { interrupted = true; return; } // Never store an incomplete part.
    const body = Buffer.concat(chunks);
    if (query.has("partNumber")) {
      parts.set(Number(query.get("partNumber")), body);
      res.writeHead(200, { etag: etag(body) }).end();
      return;
    }
    if (query.has("uploadId") && req.method === "POST") {
      if (fault === "require-interruption" && !interrupted) return fail("InvalidRequest", 400);
      if (!open) return fail(fault === "completion-error" ? "InternalError" : "NoSuchUpload", fault === "completion-error" ? 500 : 404);
      objects.set(key, Buffer.concat([...parts.values()]));
      open = false;
      return xml("<CompleteMultipartUploadResult><ETag>&quot;complete&quot;</ETag></CompleteMultipartUploadResult>");
    }
    if (req.method === "PUT") {
      if ((req.headers["if-none-match"] === "*" && objects.has(key)) ||
        (req.headers["if-match"] && (!objects.has(key) || req.headers["if-match"] !== etag(objects.get(key))))) {
        return fail("PreconditionFailed", 412);
      }
      objects.set(key, body);
      res.writeHead(200, { etag: etag(body) }).end();
      return;
    }
    if (req.method === "DELETE") {
      if (req.headers["if-match"] && objects.has(key) && req.headers["if-match"] !== etag(objects.get(key))) return fail("PreconditionFailed", 412);
      if (fault !== "cleanup-error") objects.delete(key);
      res.writeHead(204).end();
      return;
    }
    if (!objects.has(key)) return fail("NoSuchKey", 404);
    const stored = objects.get(key);
    let selected = stored;
    const headers = { etag: etag(stored), "content-type": "video/mp4" };
    if (req.headers.range) {
      const [, start, end] = /bytes=(\d+)-(\d+)/.exec(req.headers.range);
      selected = stored.subarray(Number(start), Number(end) + 1);
      headers["content-range"] = `bytes ${start}-${end}/${stored.length}`;
      if (fault !== "missing-range-header") headers["accept-ranges"] = "bytes";
    }
    headers["content-length"] = selected.length;
    res.writeHead(req.headers.range ? 206 : 200, headers);
    res.end(req.method === "HEAD" ? undefined : selected);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const child = spawn(process.execPath, ["scripts/listing-video-bucket-probe.mjs"], {
    env: {
      ...process.env, S3_ENDPOINT: `http://127.0.0.1:${server.address().port}`, S3_BUCKET: "fixture",
      S3_ACCESS_KEY_ID: "fixture-access", S3_SECRET_ACCESS_KEY: "fixture-secret", S3_REGION: "us-east-1", S3_URL_STYLE: "path",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill());
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const [code] = await once(child, "close");
  assert.doesNotMatch(output, /fixture-secret|fixture-access|X-Amz-|127\.0\.0\.1/);
  return { code, output };
}

test("missing byte-range headers cannot produce a compatible result", { timeout: 20000 }, async (t) => {
  const { code, output } = await runProbe(t, "missing-range-header");
  assert.equal(code, 1, output);
  assert.match(output, /FAIL range read/);
  assert.match(output, /PASS cleanup: no probe objects or multipart uploads remain/);
});

test("an unexpected second completion error is not safe completion", { timeout: 20000 }, async (t) => {
  const { code, output } = await runProbe(t, "completion-error");
  assert.equal(code, 1, output);
  assert.match(output, /FAIL multipart: completing twice is safe/);
  assert.match(output, /PASS cleanup: no probe objects or multipart uploads remain/);
});

test("an interrupted part can be retried and completed with intact bytes", { timeout: 20000 }, async (t) => {
  const { code, output } = await runProbe(t, "require-interruption");
  assert.equal(code, 0, output);
  assert.match(output, /PASS multipart: presigned part retried after interruption/);
  assert.match(output, /PASS multipart: completing twice is safe/);
  assert.match(output, /RESULT compatible/);
});

test("unverified cleanup blocks a compatible result", { timeout: 20000 }, async (t) => {
  const { code, output } = await runProbe(t, "cleanup-error");
  assert.equal(code, 1, output);
  assert.match(output, /FAIL cleanup: no probe objects or multipart uploads remain/);
  assert.match(output, /RESULT incompatible/);
});
