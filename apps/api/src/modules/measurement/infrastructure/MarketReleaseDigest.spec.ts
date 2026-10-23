import { expect,it } from "vitest";

import { marketReleaseDigest } from "./MarketReleaseDigest";
it("keeps a fixed release readable after PostgreSQL JSONB reorders object keys",()=>{
 const admitted={cells:[{market:"TM",period:"2001-10",observations:30}],fences:[{id:"synthetic",version:1,epoch:"current"}],epoch:"current"};
 const persisted={epoch:"current",fences:[{epoch:"current",version:1,id:"synthetic"}],cells:[{observations:30,period:"2001-10",market:"TM"}]};
 expect(marketReleaseDigest(persisted)).toBe(marketReleaseDigest(admitted));
 expect(marketReleaseDigest({...admitted,cells:[{...admitted.cells[0],observations:35}]})).not.toBe(marketReleaseDigest(admitted));
});
