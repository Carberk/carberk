import { beforeEach,expect,it,vi } from "vitest";
import { http,HttpResponse } from "msw";
import { Pressable,Text } from "react-native";
import { waitFor } from "@testing-library/react-native";
import type { MeasurementSchemas } from "@auto-tm/contracts";

import { server } from "../../test/msw";
import { act,fireEvent,renderMobile } from "../../test/render";
import { useVerifyOtp } from "../api/identity/useVerifyOtp";
import { clearAuthSession } from "../auth/session";

import { measurementHost } from "./nativeMeasurement";
vi.hoisted(()=>{process.env["EXPO_PUBLIC_MEASUREMENT_ENABLED"]="true";});
const events:MeasurementSchemas.MeasurementEvent[]=[],guest=`mg_${"a".repeat(43)}`,visitId="00000000-0000-4000-8000-000000000501";
function Probe(){const verify=useVerifyOtp();return <Pressable accessibilityRole="button" accessibilityLabel="Verify" onPress={()=>verify.mutate({email:"synthetic@example.test",code:"123456"})}><Text>{verify.status}</Text></Pressable>;}
beforeEach(async()=>{events.length=0;await clearAuthSession();measurementHost.invalidate();server.use(
 http.post("*/api/v1/measurement/bootstrap",()=>HttpResponse.json({visitId,generation:"synthetic-generation",purposes:["product_improvement","product_reliability"],guestCapability:guest})),
 http.post("*/api/v1/measurement/events",async({request})=>{events.push(...(await request.json() as {events:MeasurementSchemas.MeasurementEvent[]}).events);return new HttpResponse(null,{status:204});}));await measurementHost.foreground();});
it("correlates the real sign-in request with a minimal started fact and leaves canonical outcome to server",async()=>{
 let headers:Headers|undefined;server.use(http.post("*/api/v1/auth/otp/verify",({request})=>{headers=request.headers;return HttpResponse.json({accessToken:"test",refreshToken:"test",user:{id:visitId,email:"synthetic@example.test",phone:null,role:"buyer",displayName:null}});}));
 const view=await renderMobile(<Probe/>);await act(async()=>{fireEvent.press(view.getByRole("button",{name:"Verify"}));});await waitFor(()=>expect(view.getByText("success")).toBeTruthy());await measurementHost.queue.flush();
 const started=events.find(event=>event.eventName==="sign_in_started");expect(started?.payload).toEqual({attemptId:headers?.get("x-measurement-attempt"),method:"email"});expect(headers?.get("x-measurement-guest")).toBe(guest);expect(events.some(event=>event.eventName==="sign_in_result")).toBe(false);expect(JSON.stringify(events)).not.toContain("synthetic@example.test");expect(JSON.stringify(events)).not.toContain("123456");
});
it("records only an unconfirmed transport failure when the actual sign-in connection fails",async()=>{
 server.use(http.post("*/api/v1/auth/otp/verify",()=>HttpResponse.error()));const view=await renderMobile(<Probe/>);await act(async()=>{fireEvent.press(view.getByRole("button",{name:"Verify"}));});await waitFor(()=>expect(view.getByText("error")).toBeTruthy());await measurementHost.queue.flush();expect(events.filter(event=>event.eventName==="sign_in_transport_result").map(event=>event.payload)).toEqual([expect.objectContaining({result:"unconfirmed_failure",category:"network"})]);expect(events.some(event=>event.eventName==="sign_in_result")).toBe(false);
});
