import { PrismaService, type Prisma, withCampaignPreparation } from "@auto-tm/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaUploadClaims } from "./PrismaUploadClaims";

// AUTHORED ONLY. Not imported/collected/executed by this writer. Parent installs
// testing/upload-claims-r7c-20261025.sql before its matching guard activation.
// Real production claim callers oppose each other; the proxy only pauses a
// completed DB statement or injects a driver failure. No handwritten adopter.
const prefix = (n: number) => `r7c-20261025-${n}`;
const clock = { now: () => new Date() };
function gate() {
  let release: () => void = () => undefined;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}
function instrument(db: PrismaService, pause?: string, fail?: string) {
  const reached = gate(), release = gate();
  let pid = 0, paused = false;
  const service = new Proxy(db, { get(target, property) {
    if (property !== "$transaction") {
      const value: unknown = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    }
    return <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => target.$transaction(async tx => {
      pid = (await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0]?.pid ?? 0;
      return work(new Proxy(tx, { get(client, name) {
        const value: unknown = Reflect.get(client, name);
        if ((name !== "$queryRaw" && name !== "$executeRaw") || typeof value !== "function") return typeof value === "function" ? value.bind(client) : value;
        return async (...args: unknown[]) => {
          const result: unknown = await Reflect.apply(value, client, args);
          const sql = args[0] as TemplateStringsArray | { sql: string };
          const text = Array.isArray(sql) ? sql.join("?") : (sql as { sql: string }).sql;
          if (fail && text.includes(fail)) throw new Error("r7c_cleanup_rollback_sentinel");
          if (pause && !paused && text.includes(pause)) { paused = true; reached.release(); await release.promise; }
          return result;
        };
      } }));
    });
  } });
  return { service, reached, release, pid: () => pid };
}
async function entered(reached: Promise<void>, running: Promise<unknown>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([reached, running.then(() => { throw new Error("r7c_hold_boundary_not_reached"); }),
      new Promise<never>((_resolve,reject) => { timer = setTimeout(() => reject(new Error("r7c_hold_boundary_timeout")),1500); })]);
  } finally { if (timer) clearTimeout(timer); }
}
async function blocked(db: PrismaService, waiter: () => number, holder: () => number) {
  const deadline = Date.now()+1500;
  while (Date.now()<deadline) {
    const [row] = await db.$queryRaw<{ blocked: boolean }[]>`SELECT ${holder()}::int=ANY(pg_blocking_pids(${waiter()}::int)) AS blocked`;
    if (row?.blocked) return;
    await new Promise(resolve => setTimeout(resolve,10));
  }
  throw new Error("r7c_backend_wait_not_observed");
}
async function state(db: PrismaService, n: number) {
  return {
    uploads: await db.mediaUpload.findMany({ where: { id: { in: ["one","two","foreign"].map(id => `${prefix(n)}-${id}`) } }, orderBy: { id: "asc" } }),
    cleanup: await db.mediaUploadCleanup.findMany({ where: { uploadId: { startsWith: prefix(n) } }, orderBy: { uploadId: "asc" } }),
  };
}
const reserve = (db: PrismaService, n: number) => new PrismaUploadClaims(db,clock).reserve({
  userId: `${prefix(n)}-owner`, uploadIds: [`${prefix(n)}-one`,`${prefix(n)}-two`], target: { type: "profile", id: `${prefix(n)}-owner` },
});
function token(value: Awaited<ReturnType<typeof reserve>>) {
  if (!("token" in value)) throw new Error("r7c_expected_reservation_token");
  return value.token;
}

describe("R7c parent activated disposable claim transactions", { concurrent: false }, () => {
  const db = new PrismaService(), a = new PrismaService(), b = new PrismaService();
  beforeAll(async () => {
    const [ready] = await db.$queryRaw<{ source: boolean; campaign: boolean }[]>`
      SELECT public.diagnostic_source_guards_ready() AS source,public.campaign_preparation_ready() AS campaign`;
    expect(ready).toEqual({ source: true, campaign: true });
    for (let n=1;n<=9;n++) {
      const before = await state(db,n);
      expect(before.uploads).toHaveLength(3);
      expect(before.cleanup).toEqual([]);
      expect(before.uploads.every(u => u.state === "AVAILABLE" && u.claimToken === null && u.objectKeys.length === 5 && u.objectKeys.includes(u.key))).toBe(true);
    }
  });
  afterAll(async () => { await Promise.all([db.onModuleDestroy(),a.onModuleDestroy(),b.onModuleDestroy()]); });

  it.each([true,false])("opposes real reserve and retireUnclaimed in both orders, reserveFirst=%s", async reserveFirst => {
    const n=reserveFirst?1:2, before=await state(db,n);
    const first=instrument(a,"SELECT 1 FROM public.users"),second=instrument(b);
    const retire=(client: PrismaService) => new PrismaUploadClaims(client,clock).retireUnclaimed(`${prefix(n)}-one`,`${prefix(n)}-owner`,async () => true);
    const held=(reserveFirst?reserve(first.service,n):retire(first.service)).then(value => ({ value }),error => ({ error }));
    let followed: Promise<{ value: unknown } | { error: unknown }> | undefined;
    let failure: unknown;
    try {
      await entered(first.reached.promise,held);
      followed=(reserveFirst?retire(second.service):reserve(second.service,n)).then(value => ({ value }),error => ({ error }));
      await blocked(db,second.pid,first.pid);
    } catch(error) { failure=error; }
    finally { first.release.release(); await Promise.all([held,...(followed?[followed]:[])]); }
    if(failure) throw failure;
    const firstOutcome = await held;
    if (reserveFirst) expect(firstOutcome).toMatchObject({ value: { joined: false } });
    else expect(firstOutcome).toEqual({ value: true });
    if(!followed) throw new Error("r7c_opponent_not_started");
    const outcome=await followed;
    expect(outcome).toHaveProperty("error");
    if (!("error" in outcome)) throw new Error("r7c_expected_stale_refusal");
    expect(String(outcome.error)).toContain("upload_claim_scope_changed");
    const after=await state(db,n);
    expect(after.uploads.find(u=>u.id.endsWith("-one"))?.state).toBe(reserveFirst?"PREPARING":"RETIRED");
    expect(after.uploads.find(u=>u.id.endsWith("-two"))?.state).toBe(reserveFirst?"PREPARING":"AVAILABLE");
    expect(after.cleanup.map(c=>c.uploadId)).toEqual(reserveFirst?[]:[`${prefix(n)}-one`]);
    expect(after.uploads.find(u=>u.id.endsWith("-foreign"))).toEqual(before.uploads.find(u=>u.id.endsWith("-foreign")));
  });

  it("rolls back a completed first cleanup and its claim on driver failure", async () => {
    const n=3, reservation=await reserve(db,n), before=await state(db,n);
    const failed=instrument(a,undefined,"INSERT INTO media_upload_cleanups");
    await expect(new PrismaUploadClaims(failed.service,clock).abandon(token(reservation))).rejects.toThrow("r7c_cleanup_rollback_sentinel");
    expect(await state(db,n)).toEqual(before);
  });
  it("release and settle preserve the foreign upload and exact inventory", async () => {
    const n=4, before=await state(db,n), claims=new PrismaUploadClaims(db,clock);
    await claims.release(token(await reserve(db,n)));
    expect(await state(db,n)).toEqual(before);
    const reservation=await reserve(db,n);
    expect(await claims.settle(token(reservation),`${prefix(n)}-one`)).toBe(true);
    expect(await claims.settle(token(reservation),`${prefix(n)}-one`)).toBe(false);
    const after=await state(db,n), retired=before.uploads.find(u=>u.id.endsWith("-one"));
    expect(after.cleanup).toEqual([expect.objectContaining({ uploadId:retired?.id,key:retired?.key,objectKeys:retired?.objectKeys,writeProtocol:"conditional-v1",status:"PENDING" })]);
    expect(after.uploads.find(u=>u.id.endsWith("-two"))?.state).toBe("AVAILABLE");
    expect(after.uploads.find(u=>u.id.endsWith("-foreign"))).toEqual(before.uploads.find(u=>u.id.endsWith("-foreign")));
  });
  it.each(["missing","finished"] as const)("refuses a %s receipt before supplied writes",async kind=>{
    const n=kind==="missing"?5:6, claims=new PrismaUploadClaims(db,clock), before=await state(db,n);
    await expect(db.$transaction(async tx=>{
      if(kind==="finished") await withCampaignPreparation(tx,[{table:"media_uploads",key:{id:`${prefix(n)}-one`},verb:"update",next:{state:"RETIRED"}}],async()=>undefined);
      await claims.retire(tx,`${prefix(n)}-one`);
    })).rejects.toThrow("upload_claim_preparation_missing");
    expect(await state(db,n)).toEqual(before);
  });
  it("refuses another backend's live receipt even with copied marker fields",async()=>{
    const n=7, reached=gate(),release=gate(); let failure: unknown;
    const holder=a.$transaction(tx=>withCampaignPreparation(tx,[{table:"media_uploads",key:{id:`${prefix(n)}-one`},verb:"update",next:{state:"RETIRED"}}],async()=>{reached.release();await release.promise;})).then(()=>({ok:true}),error=>({error}));
    try {
      await entered(reached.promise,holder);
      await expect(b.$transaction(tx=>new PrismaUploadClaims(b,clock).retire(new Proxy(tx,{get(client,key){return key==="receiptId"?"copied":Reflect.get(client,key);}}),`${prefix(n)}-one`))).rejects.toThrow("upload_claim_preparation_missing");
    } catch(error){failure=error;}
    finally{release.release();await holder;}
    if(failure)throw failure;
    expect(await holder).toEqual({ok:true});
    expect((await state(db,n)).cleanup).toEqual([]);
  });
  it("refuses ordinary namespace preparation with uncovered resource keys",async()=>{
    const n=8, before=await state(db,n);
    await expect(db.$transaction(tx=>withCampaignPreparation(tx,[{table:"media_uploads",key:{id:`${prefix(n)}-one`},verb:"update",next:{state:"RETIRED"}}],
      ()=>new PrismaUploadClaims(db,clock).retire(tx,`${prefix(n)}-one`)))).rejects.toThrow("upload_claim_preparation_uncovered");
    expect(await state(db,n)).toEqual(before);
  });
  it("reuses an exact live ordinary preparation without a nested finish",async()=>{
    const n=9, claims=new PrismaUploadClaims(db,clock), reservation=await reserve(db,n);
    await db.$transaction(async tx=>{
      const mutation = {table:"media_uploads",key:{id:`${prefix(n)}-one`},verb:"update" as const,next:{state:"ADOPTED",claimToken:null,claimDeadline:null}};
      // This is a fixture for supplied receipt reuse, not a production opponent.
      // The two physical rows and both negative unique slots are known upfront.
      const [owner] = await tx.$queryRaw<{row:Prisma.JsonObject}[]>`SELECT to_jsonb(u) AS row FROM public.users u WHERE id=${`${prefix(n)}-owner`}`;
      const [upload] = await tx.$queryRaw<{row:Prisma.JsonObject}[]>`SELECT to_jsonb(u) AS row FROM public.media_uploads u WHERE id=${`${prefix(n)}-one`}`;
      if(!owner||!upload)throw new Error("r7c_reuse_fixture_missing");
      const slots=[
        {table:"users",key:{id:`${prefix(n)}-owner`},row:owner.row},
        {table:"media_uploads",key:{id:`${prefix(n)}-one`},row:upload.row},
        {table:"users",key:{avatarUploadId:`${prefix(n)}-one`},row:{avatarUploadId:`${prefix(n)}-one`}},
        {table:"listing_media",key:{uploadId:`${prefix(n)}-one`},row:{uploadId:`${prefix(n)}-one`}},
      ];
      await withCampaignPreparation(tx,[mutation,{table:"users",key:{id:`${prefix(n)}-owner`},verb:"update",next:{avatarUploadId:`${prefix(n)}-one`,avatarKey:`${prefix(n)}/one/original.webp`}}],async()=>{
        const [derived]=await tx.$queryRaw<{keys:{namespace:number;key:number}[]}[]>`
          SELECT public.diagnostic_source_lock_keys_before_intake(${JSON.stringify(slots)}::jsonb,${JSON.stringify({rows:[mutation]})}::jsonb) AS keys`;
        if(!derived)throw new Error("r7c_reuse_keys_missing");
        for(const key of derived.keys)await tx.$queryRaw`SELECT pg_advisory_xact_lock(${key.namespace}::int,${key.key}::int)`;
        await tx.$queryRaw`SELECT id FROM public.users WHERE id=${`${prefix(n)}-owner`} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM public.media_uploads WHERE id=${`${prefix(n)}-one`} FOR UPDATE`;
        expect(await claims.finalize(tx,{token:token(reservation),uploadIds:[`${prefix(n)}-one`],target:{type:"profile",id:`${prefix(n)}-owner`}})).toBe("adopted");
        await tx.user.update({where:{id:`${prefix(n)}-owner`},data:{avatarUploadId:`${prefix(n)}-one`,avatarKey:`${prefix(n)}/one/original.webp`}});
        expect(await claims.finalize(tx,{token:token(reservation),uploadIds:[`${prefix(n)}-one`],target:{type:"profile",id:`${prefix(n)}-owner`}})).toBe("already");
        const [live]=await tx.$queryRaw<{total:bigint}[]>`SELECT count(*) AS total FROM public.campaign_preparations WHERE backend_pid=pg_backend_pid() AND full_transaction_id=pg_current_xact_id()::text`;
        expect(live?.total).toBe(1n);
      });
    });
    expect((await state(db,n)).uploads.find(u=>u.id.endsWith("-one"))?.state).toBe("ADOPTED");
  });

});
