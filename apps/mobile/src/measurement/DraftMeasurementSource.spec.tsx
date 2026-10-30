import { beforeEach,expect,it,vi } from "vitest";
import { http,HttpResponse } from "msw";
import { Pressable,Text } from "react-native";
import { waitFor } from "@testing-library/react-native";
import type { MeasurementSchemas } from "@auto-tm/contracts";

import { server } from "../../test/msw";
import { act,fireEvent,renderMobile } from "../../test/render";
import { useCreateDraft } from "../api/listings/useCreateDraft";
import { clearAuthSession } from "../auth/session";

import { measurementHost } from "./nativeMeasurement";
vi.hoisted(()=>{process.env["EXPO_PUBLIC_MEASUREMENT_ENABLED"]="true";});
const events:MeasurementSchemas.MeasurementEvent[]=[],draftId="00000000-0000-4000-8000-000000000701",visitId="00000000-0000-4000-8000-000000000501";
function Probe(){const create=useCreateDraft();return <Pressable accessibilityRole="button" accessibilityLabel="Create" onPress={()=>create.mutate({description:"private seller text"})}><Text>{create.status}</Text></Pressable>;}
beforeEach(async()=>{events.length=0;await clearAuthSession();measurementHost.invalidate();server.use(http.post("*/api/v1/measurement/bootstrap",()=>HttpResponse.json({visitId,generation:"synthetic-generation",purposes:["product_improvement"],guestCapability:`mg_${"a".repeat(43)}`})),http.post("*/api/v1/measurement/events",async({request})=>{events.push(...(await request.json() as {events:MeasurementSchemas.MeasurementEvent[]}).events);return new HttpResponse(null,{status:204});}));await measurementHost.foreground();});
it("records the actual accepted draft only once without its editable payload",async()=>{
 server.use(http.post("*/api/v1/listings/drafts",()=>HttpResponse.json({id:draftId,userId:visitId,payload:{description:"private seller text"},createdAt:"2026-10-18T00:00:00Z",updatedAt:"2026-10-18T00:00:00Z"})));
 const view=await renderMobile(<Probe/>);await act(async()=>{fireEvent.press(view.getByRole("button",{name:"Create"}));});await waitFor(()=>expect(view.getByText("success")).toBeTruthy());await measurementHost.queue.flush();expect(events.filter(event=>event.eventName==="draft_started").map(event=>event.payload)).toEqual([{draftId}]);expect(JSON.stringify(events)).not.toContain("private seller text");
});
