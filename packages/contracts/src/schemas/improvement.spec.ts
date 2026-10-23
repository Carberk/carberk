import { expect,it } from "vitest";

import { improvementWindow } from "./improvement";
it("keeps one disjoint Monday UTC partition through the whole week and across comparison roles",()=>{
 const monday=new Date("2026-10-12T00:00:00Z"),sunday=new Date("2026-10-18T23:59:59Z");
 expect(improvementWindow("completed_week",monday)).toEqual({from:new Date("2026-10-05T00:00:00Z"),to:monday});
 expect(improvementWindow("completed_week",sunday)).toEqual(improvementWindow("completed_week",monday));
 expect(improvementWindow("previous_week",new Date("2026-10-19T00:00:00Z"))).toEqual(improvementWindow("completed_week",monday));
});
