import { expect,it } from "vitest";
import { PrismaMeasurementStore } from "./PrismaMeasurementStore";

it.each(["","invalid","2026-10-17T00:00:00Z"])("withholds store bootstrap and identity resolution for supplied expired/malformed admission %j",async expiresAt=>{
 const store=new PrismaMeasurementStore({} as never,{epoch:"synthetic",environment:"staging",population:"synthetic",expiresAt},()=>new Date("2026-10-18T00:00:00Z"));
 await expect(store.bootstrap({})).resolves.toBeNull();await expect(store.resolve({guestCapability:`mg_${"a".repeat(43)}`})).resolves.toBeNull();
});
