import { createHash } from "node:crypto";
import { once } from "node:events";
import { createConnection, createServer, type Socket } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { frameEnd, interruptRedis } from "./redis-interruption-transport";

// Synthetic RESP bytes only. This endpoint is not Redis and executes no Lua.
// Compare byte digests so a failed assertion cannot print transport contents.
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const auth = Buffer.from("*2\r\n$4\r\nAUTH\r\n$9\r\nsynthetic\r\n");
const info = Buffer.from("*1\r\n$4\r\nINFO\r\n");
const observation = Buffer.from("*3\r\n$4\r\nEVAL\r\n$32\r\n#!lua flags=no-writes\nreturn {1}\r\n$1\r\n0\r\n");
const mutation = Buffer.from("*3\r\n$4\r\nEVAL\r\n$8\r\nreturn 1\r\n$1\r\n0\r\n");
const replies = Buffer.from("+OK\r\n$4\r\ninfo\r\n*2\r\n:1\r\n$3\r\na\r\n\r\n");
const mutationReply = Buffer.from(":1\r\n");
const cleanups: (() => Promise<void>)[] = [];

async function fragments(socket: Socket, bytes: Buffer) {
  for (const byte of bytes) {
    if (socket.destroyed) return;
    socket.write(Buffer.from([byte]));
    await new Promise<void>(resolve => setImmediate(resolve));
  }
}

async function endpoint(onBytes: (socket: Socket, bytes: Buffer) => void) {
  const sockets = new Set<Socket>();
  let accept!: (socket: Socket) => void;
  const accepted = new Promise<Socket>(resolve => { accept = resolve; });
  const server = createServer(socket => {
    sockets.add(socket);
    accept(socket);
    socket.on("error", () => undefined);
    socket.on("close", () => sockets.delete(socket));
    socket.on("data", chunk => onBytes(socket, chunk));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Synthetic endpoint has no port");
  cleanups.push(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });
  return { host: "127.0.0.1", port: address.port, sockets, accepted };
}

async function connect(port: number) {
  const client = createConnection({ host: "127.0.0.1", port });
  client.on("error", () => undefined);
  const closed = new Promise<void>(resolve => client.once("close", () => resolve()));
  cleanups.push(async () => { client.destroy(); await closed; });
  await once(client, "connect");
  return { client, closed };
}

function received(socket: Socket, size: number) {
  return new Promise<Buffer>(resolve => {
    let bytes = Buffer.alloc(0);
    const listener = (chunk: Buffer) => {
      bytes = Buffer.concat([bytes, chunk]);
      if (bytes.length >= size) { socket.off("data", listener); resolve(bytes); }
    };
    socket.on("data", listener);
  });
}

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe("test-only Redis interruption transport framing", () => {
  it("waits for every byte of nested, binary bulk and null RESP frames", () => {
    const frame = Buffer.from("*4\r\n$3\r\na\r\n\r\n$-1\r\n*-1\r\n*2\r\n+OK\r\n-ERR synthetic\r\n");
    for (let cut = 0; cut < frame.length; cut++) expect(frameEnd(frame.subarray(0, cut))).toBeUndefined();
    expect(frameEnd(frame)).toBe(frame.length);
    const pipeline = Buffer.concat([frame, Buffer.from(":7\r\n")]);
    expect(frameEnd(pipeline)).toBe(frame.length);
    expect(frameEnd(pipeline, frame.length)).toBe(frame.length + 4);
  });

  for (const mode of ["before-lua", "lua-reply"] as const) {
    it(`${mode} forwards fragmented pipelined AUTH/INFO/no-writes replies unchanged and selects only mutation`, async () => {
      const prefix = Buffer.concat([auth, info, observation]);
      let upstreamBytes = Buffer.alloc(0), replied = false;
      let mutationArrivals = 0;
      let upstreamClosed: Promise<unknown> | undefined;
      const target = await endpoint((socket, bytes) => {
        if (!upstreamClosed) upstreamClosed = new Promise<void>(resolve => socket.once("close", () => resolve()));
        upstreamBytes = Buffer.concat([upstreamBytes, bytes]);
        if (!replied && upstreamBytes.length >= prefix.length) {
          replied = true;
          void fragments(socket, replies);
        }
        if (upstreamBytes.length === prefix.length + mutation.length) {
          mutationArrivals++;
          void fragments(socket, mutationReply);
        }
      });
      const proxy = await interruptRedis(target, mode);
      cleanups.push(proxy.close);
      const { client, closed } = await connect(proxy.port);
      const response = received(client, replies.length);
      await fragments(client, prefix);
      expect(digest(await response)).toBe(digest(replies));
      expect(digest(upstreamBytes)).toBe(digest(prefix));
      expect(proxy.dropped()).toBeUndefined();
      let downstreamBytes = Buffer.alloc(0);
      client.on("data", chunk => { downstreamBytes = Buffer.concat([downstreamBytes, chunk]); });
      await fragments(client, mutation);
      await closed;
      await upstreamClosed;
      expect(proxy.dropped()).toBe(mode);
      expect(mutationArrivals).toBe(mode === "lua-reply" ? 1 : 0);
      expect(digest(upstreamBytes)).toBe(digest(mode === "lua-reply" ? Buffer.concat([prefix, mutation]) : prefix));
      expect(downstreamBytes.length).toBe(0);
      expect(target.sockets.size).toBe(0);
    }, 5000);
  }

  it("forwards a whole pipelined request and preceding replies when the mutation reply shares their chunk", async () => {
    const request = Buffer.concat([auth, info, observation, mutation]);
    let upstreamBytes = Buffer.alloc(0);
    const target = await endpoint((socket, bytes) => {
      upstreamBytes = Buffer.concat([upstreamBytes, bytes]);
      if (upstreamBytes.length === request.length) socket.write(Buffer.concat([replies, mutationReply]));
    });
    const proxy = await interruptRedis(target, "lua-reply");
    cleanups.push(proxy.close);
    const { client, closed } = await connect(proxy.port);
    let downstreamBytes = Buffer.alloc(0);
    client.on("data", chunk => { downstreamBytes = Buffer.concat([downstreamBytes, chunk]); });
    client.write(request);
    await closed;
    expect(digest(upstreamBytes)).toBe(digest(request));
    expect(digest(downstreamBytes)).toBe(digest(replies));
    expect(proxy.dropped()).toBe("lua-reply");
  }, 5000);

  it("close shuts down an active partial request and releases the listener and upstream socket", async () => {
    const target = await endpoint(() => undefined);
    // Observe acceptance independently of the proxy's request framing.
    const proxy = await interruptRedis(target, "lua-reply");
    const { client, closed } = await connect(proxy.port);
    let proxyClosed = false;
    cleanups.push(async () => { if (!proxyClosed) await proxy.close(); });
    const upstream = await target.accepted;
    const upstreamClosed = new Promise<void>(resolve => upstream.once("close", () => resolve()));
    client.write(Buffer.from("*2\r\n$4\r\nEV"));
    await proxy.close();
    proxyClosed = true;
    await closed;
    await upstreamClosed;
    expect(proxy.dropped()).toBeUndefined();
    expect(target.sockets.size).toBe(0);
    const refused = createConnection({ host: "127.0.0.1", port: proxy.port });
    const failure = await new Promise<boolean>(resolve => {
      refused.once("error", () => resolve(true));
      refused.once("connect", () => resolve(false));
    });
    refused.destroy();
    expect(failure).toBe(true);
  }, 5000);

  for (const closingSide of ["client", "upstream"] as const) {
    it(`cleans up both sockets when the ${closingSide} closes without selecting an interruption`, async () => {
      const target = await endpoint(() => undefined);
      const proxy = await interruptRedis(target, "lua-reply");
      cleanups.push(proxy.close);
      const { client, closed } = await connect(proxy.port);
      const upstream = await target.accepted;
      const upstreamClosed = new Promise<void>(resolve => upstream.once("close", () => resolve()));
      if (closingSide === "client") client.end();
      else upstream.end();
      await closed;
      await upstreamClosed;
      expect(target.sockets.size).toBe(0);
      expect(proxy.dropped()).toBeUndefined();
    }, 5000);
  }
});
