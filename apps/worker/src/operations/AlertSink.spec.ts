import { createServer } from "node:http";

import { describe, expect, it } from "vitest";

import { AlertSink, restoreIncident } from "./AlertSink";
import { operationsConfig } from "./OperationsConfig";
import { Watchdog, type OperationsSnapshot } from "./Watchdog";

it("keeps sink disabled unless explicitly configured and rejects credentials and query strings", () => {
  expect(operationsConfig({ OPERATIONS_ALERT_SINK_URL: "https://example.com/sink" }).alertSinkUrl).toBeUndefined();
  expect(() => operationsConfig({ OPERATIONS_ALERTS_ENABLED: "true" })).toThrow();
  expect(() => operationsConfig({ OPERATIONS_ALERT_SINK_URL: "https://example.com/sink?secret=x" })).toThrow();
});

describe("controlled operational sink", () => {
  it("delivers sanitized transitions to an actual HTTP sink, retries failure and suppresses repeats", async () => {
    let status = 503;
    const bodies: string[] = [];
    const server = createServer((req, res) => {
      let body = ""; req.on("data", chunk => { body += String(chunk); });
      req.on("end", () => { bodies.push(body); res.writeHead(status); res.end("receipt"); });
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); if (!address || typeof address === "string") throw new Error("No test listener");
    const sink = new AlertSink(`http://127.0.0.1:${address.port}`, undefined);
    const now = "2026-10-18T00:00:00Z";
    const snapshot: OperationsSnapshot = { version: 1, observedAt: now, api: "failing", collector: "healthy", worker: "healthy", queues: [],
      incident: { openedAt: now, lastObservedAt: now, resolvedAt: null } };
    try {
      expect(await sink.publish(snapshot)).toBe(false);
      status = 204; expect(await sink.publish(snapshot)).toBe(true);
      expect(await sink.publish(snapshot)).toBe(false);
      if (!snapshot.incident) throw new Error("Missing fixture incident");
      snapshot.incident.resolvedAt = now;
      expect(await sink.publish(snapshot)).toBe(true);
      expect(bodies).toHaveLength(3);
      expect(Object.keys(JSON.parse(bodies[0] ?? "{}") as object).sort()).toEqual(["incident", "observedAt", "probes", "version"]);
    } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  });

  it("restores original outage age across restart and refuses private, future and malformed saved state", async () => {
    const now = new Date("2026-10-18T01:00:00Z");
    const prior = { openedAt: "2026-10-17T00:00:00Z", lastObservedAt: "2026-10-18T00:59:00Z", resolvedAt: null };
    const watchdog = new Watchdog({ restoreIncident: async () => restoreIncident(JSON.stringify(prior), now), heartbeat: async () => null,
      http: async () => "unknown", queueDepths: async () => [], publish: async () => undefined });
    expect((await watchdog.check(now)).incident?.openedAt).toBe(prior.openedAt);
    expect(restoreIncident(JSON.stringify({ ...prior, secret: "private" }), now)).toBeNull();
    expect(restoreIncident(JSON.stringify({ ...prior, lastObservedAt: "2027-01-01T00:00:00Z" }), now)).toBeNull();
    expect(restoreIncident("broken", now)).toBeNull();
  });
});

it("does not resend an acknowledged transition after restart and does not send when receipt storage is unavailable", async () => {
 const bodies:string[]=[];
 const server=createServer((req,res)=>{let body="";req.on("data",chunk=>{body+=String(chunk);});req.on("end",()=>{bodies.push(body);res.writeHead(204);res.end();});});
 await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
 const address=server.address();if(!address||typeof address==="string")throw new Error("No test listener");
 let delivered:string|null=null,unavailable=false;
 const receipts={read:async()=>{if(unavailable)throw new Error("unavailable");return delivered;},save:async(value:string)=>{delivered=value;}};
 const snapshot:OperationsSnapshot={version:1,observedAt:"2026-10-18T00:00:00Z",api:"failing",collector:"unknown",worker:"healthy",queues:[],incident:{openedAt:"2026-10-18T00:00:00Z",lastObservedAt:"2026-10-18T00:00:00Z",resolvedAt:null}};
 const create=()=>new AlertSink(`http://127.0.0.1:${address.port}`,undefined,fetch,receipts);
 try{
  expect(await create().publish(snapshot)).toBe(true);
  expect(await create().publish(snapshot)).toBe(false);
  unavailable=true;
  if(!snapshot.incident)throw new Error("Missing fixture incident");
  snapshot.incident.resolvedAt=snapshot.observedAt;
  expect(await create().publish(snapshot)).toBe(false);
  expect(bodies).toHaveLength(1);
 }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
