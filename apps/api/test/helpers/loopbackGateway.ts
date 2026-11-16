import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Duplex } from "node:stream";
import { pathToFileURL } from "node:url";

export async function loopbackGateway(apiPort: number) {
  const directory = await mkdtemp(join(tmpdir(), "r07-video-gateway-"));
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost", "-keyout", join(directory, "key"), "-out", join(directory, "cert")], { stdio: "ignore" });
  const ca = await readFile(join(directory, "cert"));
  const origin = https.createServer({ key: await readFile(join(directory, "key")), cert: ca }, (req, res) => {
    const upstream = http.request({ hostname: "127.0.0.1", port: apiPort, method: req.method, path: req.url, headers: req.headers }, response => {
      res.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(res);
    });
    upstream.on("error", () => res.destroy());
    req.pipe(upstream);
  });
  const listen = (server: http.Server | https.Server) => new Promise<number>(resolve => {
    server.listen(0, "127.0.0.1", () => resolve((server.address() as net.AddressInfo).port));
  });
  const originPort = await listen(origin);
  const sockets = new Set<Duplex>();
  const relay = http.createServer();
  relay.on("connect", (req, client, head) => {
    if (req.url !== `localhost:${originPort}`) { client.destroy(); return; }
    const peer = net.connect(originPort, "127.0.0.1", () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length) peer.write(head);
      peer.pipe(client);
      client.pipe(peer);
    });
    for (const socket of [client, peer]) {
      sockets.add(socket);
      socket.on("error", () => socket.destroy());
      socket.once("close", () => { sockets.delete(socket); client.destroy(); peer.destroy(); });
    }
  });
  const relayPort = await listen(relay);
  const gatewayModule = await import(pathToFileURL(join(__dirname, "../../../../infra/gateway/gateway.mjs")).href);
  const accessKey = "r07-disposable-video-gateway-key-0123456789";
  const signing = { keyId: "r07", secret: "ab".repeat(32) };
  const gateway: http.Server = gatewayModule.createGateway({ origin: `https://localhost:${originPort}`, proxy: `http://127.0.0.1:${relayPort}`, hostname: "gateway.example.test", accessKey, signing, ca });
  await listen(gateway);
  return {
    server: gateway,
    headers: { Host: "gateway.example.test", "X-Carberk-Gateway-Key": accessKey, "X-Real-IP": "203.0.113.10" },
    signing,
    async close() {
      gateway.closeAllConnections();
      await new Promise<void>(resolve => gateway.close(() => resolve()));
      for (const socket of sockets) socket.destroy();
      origin.closeAllConnections();
      await Promise.all([origin, relay].map(server => new Promise<void>(resolve => server.close(() => resolve()))));
      await rm(directory, { recursive: true, force: true });
    },
  };
}
