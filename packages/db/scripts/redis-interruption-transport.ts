import { createServer, createConnection, type Socket } from "node:net";

// RESP2 framing only. Bytes are forwarded unchanged, never logged or used as effects.
// A whole server reply must arrive before the proxy drops it. Fragmentation and
// pipelined AUTH/INFO replies must not move the drop to another command.
export function frameEnd(bytes: Buffer, offset = 0, depth = 0): number | undefined {
  if (depth > 8 || bytes.length > 128 * 1024 * 1024) throw new Error("Disposable RESP bounds exceeded");
  const lineEnd = bytes.indexOf("\r\n", offset);
  if (lineEnd < 0) return undefined;
  const kind = bytes[offset], next = lineEnd + 2;
  if (kind === 43 || kind === 45 || kind === 58) return next;
  const count = Number(bytes.subarray(offset + 1, lineEnd).toString("ascii"));
  if (!Number.isSafeInteger(count) || count < -1) throw new Error("Invalid disposable RESP length");
  if (count === -1) return next;
  if (kind === 36) {
    const end = next + count + 2;
    if (bytes.length < end) return undefined;
    if (bytes[end - 2] !== 13 || bytes[end - 1] !== 10) throw new Error("Invalid disposable RESP bulk frame");
    return end;
  }
  if (kind !== 42) throw new Error("Unsupported disposable RESP frame");
  let cursor = next;
  for (let index = 0; index < count; index++) {
    const end = frameEnd(bytes, cursor, depth + 1);
    if (end === undefined) return undefined;
    cursor = end;
  }
  return cursor;
}

export function mutationCommand(bytes: Buffer): boolean {
  // ioredis sends commands as arrays of bulk strings. Inspect only command and
  // script header, not arguments, credentials, keys, payloads or marker values.
  if (bytes[0] !== 42) throw new Error("Unexpected disposable Redis command");
  let cursor = bytes.indexOf("\r\n") + 2;
  const argument = () => {
    if (bytes[cursor] !== 36) throw new Error("Unexpected disposable Redis argument");
    const lineEnd = bytes.indexOf("\r\n", cursor);
    const size = Number(bytes.subarray(cursor + 1, lineEnd).toString("ascii"));
    const value = bytes.subarray(lineEnd + 2, lineEnd + 2 + size);
    cursor = lineEnd + 2 + size + 2;
    return value;
  };
  return argument().toString("ascii").toLowerCase() === "eval" &&
    !argument().subarray(0, 22).equals(Buffer.from("#!lua flags=no-writes\n"));
}

export async function interruptRedis(target: { host: string; port: number }, mode: "before-lua" | "lua-reply") {
  const sockets = new Set<Socket>();
  let dropped: typeof mode | undefined, failed = false;
  const server = createServer(client => {
    const upstream = createConnection({ host: target.host, port: target.port });
    sockets.add(client); sockets.add(upstream);
    let requests = Buffer.alloc(0), replies = Buffer.alloc(0);
    const pending: boolean[] = [];
    const destroy = () => { client.destroy(); upstream.destroy(); };
    for (const socket of [client, upstream]) {
      socket.on("error", () => { failed = true; destroy(); });
      socket.on("close", () => { sockets.delete(socket); destroy(); });
    }
    client.on("data", chunk => {
      try {
        requests = Buffer.concat([requests, chunk]);
        let end;
        while ((end = frameEnd(requests)) !== undefined) {
          const command = requests.subarray(0, end);
          requests = requests.subarray(end);
          const mutation = mutationCommand(command);
          if (mutation && mode === "before-lua") { dropped = mode; destroy(); return; }
          pending.push(mutation);
          upstream.write(command);
        }
      } catch { failed = true; destroy(); }
    });
    upstream.on("data", chunk => {
      try {
        replies = Buffer.concat([replies, chunk]);
        let end;
        while ((end = frameEnd(replies)) !== undefined) {
          if (!pending.length) throw new Error("Unpaired disposable Redis reply");
          const mutation = pending.shift();
          const reply = replies.subarray(0, end);
          replies = replies.subarray(end);
          if (mutation) { dropped = mode; destroy(); return; }
          client.write(reply);
        }
      } catch { failed = true; destroy(); }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Disposable proxy has no port");
  return { port: address.port, dropped: () => failed ? undefined : dropped,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    } };
}
