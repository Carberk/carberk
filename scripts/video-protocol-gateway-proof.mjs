import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";

import { authorizeAsset, rewriteManifest } from "./video-protocol-proof.mjs";

/** Loopback fixture server only. No app routes, provider credentials or public deployment. */
export async function createGatewayProof(directory) {
  const assets = new Set((await readdir(directory)).filter((name) => /^[a-zA-Z0-9_.-]+\.(m3u8|ts|mp4|webp|jpg)$/.test(name)));
  const grant = { owner: "fixture-tester", listing: "fixture-listing", generation: "fixture-generation", purpose: "playback",
    expiresAt: Date.now() + 60_000, assets: [...assets] };
  const current = { listing: grant.listing, generation: grant.generation, enabled: true, tester: true, activeAccount: true, listingVisible: true };
  const receipt = { manifests: 0, segments: 0, denied: 0 };
  const server = createServer(async (request, response) => {
    const match = /^\/proof-grants\/fixture-token\/([a-zA-Z0-9_.-]+)$/.exec(request.url ?? "");
    try {
      if (!match) throw new Error("UNAVAILABLE");
      const asset = match[1];
      const headers = authorizeAsset({ grant, owner: grant.owner, asset, purpose: "playback" }, { ...current, now: Date.now() });
      response.setHeader("Cache-Control", headers.cacheControl);
      if (asset.endsWith(".m3u8")) {
        const text = await readFile(path.join(directory, asset), "utf8");
        const rewritten = rewriteManifest(text, request.url, assets);
        receipt.manifests++;
        response.setHeader("Content-Type", "application/vnd.apple.mpegurl"); response.end(rewritten);
      } else {
        receipt.segments++;
        response.setHeader("Content-Type", asset.endsWith(".ts") ? "video/mp2t" : asset.endsWith(".webp") ? "image/webp" : asset.endsWith(".jpg") ? "image/jpeg" : "video/mp4");
        await pipeline(createReadStream(path.join(directory, asset)), response);
      }
    } catch {
      receipt.denied++;
      if (!response.headersSent) { response.statusCode = 404; response.setHeader("Cache-Control", "private, no-store"); response.end(); }
      else response.destroy();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return { url: `http://127.0.0.1:${address.port}/proof-grants/fixture-token/master.m3u8`, current, receipt,
    close: async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); } };
}
