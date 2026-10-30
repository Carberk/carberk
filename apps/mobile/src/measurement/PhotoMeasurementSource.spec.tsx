import { beforeEach,expect,it,vi } from "vitest";
import { http,HttpResponse } from "msw";
import { Pressable,Text } from "react-native";
import { waitFor } from "@testing-library/react-native";
import type { MeasurementSchemas } from "@auto-tm/contracts";

import { server } from "../../test/msw";
import { act,fireEvent,renderMobile } from "../../test/render";
import { storeAuthSession,clearAuthSession } from "../auth/session";
import { useUploadQueue } from "../listings/uploadStaging/useUploadQueue";

import { measurementHost } from "./nativeMeasurement";
vi.hoisted(()=>{process.env["EXPO_PUBLIC_MEASUREMENT_ENABLED"]="true";});
const native=vi.hoisted(()=>({uploadStatus:200,prepareFails:false}));
vi.mock("expo-secure-store",()=>{const values=new Map<string,string>();return {getItemAsync:async(key:string)=>values.get(key)??null,setItemAsync:async(key:string,value:string)=>{values.set(key,value);},deleteItemAsync:async(key:string)=>{values.delete(key);}};});
vi.mock("expo-file-system/legacy",()=>({getInfoAsync:async()=>({exists:true,size:1000}),readDirectoryAsync:async()=>[],makeDirectoryAsync:async()=>undefined,deleteAsync:async()=>undefined,copyAsync:async()=>undefined,uploadAsync:async()=>({status:native.uploadStatus}),FileSystemUploadType:{BINARY_CONTENT:0},documentDirectory:"file:///doc/"}));
vi.mock("expo-image-manipulator",()=>({SaveFormat:{WEBP:"webp"},ImageManipulator:{manipulate:()=>({resize:()=>undefined,renderAsync:async()=>{if(native.prepareFails)throw new Error("private native filename");return {width:100,height:100,release:()=>undefined,saveAsync:async()=>({uri:"file:///private/prepared.webp",width:100,height:100})};}})}}));
vi.mock("@react-native-community/netinfo",()=>({default:{addEventListener:()=>()=>undefined,fetch:async()=>({isConnected:true})}}));
const events:MeasurementSchemas.MeasurementEvent[]=[],visitId="00000000-0000-4000-8000-000000000501";
function Probe(){const queue=useUploadQueue("draft-00000000-0000-4000-8000-000000000701",{});return <Pressable accessibilityRole="button" accessibilityLabel="Pick" disabled={!queue.isReady} onPress={()=>{void queue.addPhoto("file:///private/source.jpg");}}><Text>{queue.photos[0]?.state??"empty"}</Text></Pressable>;}
beforeEach(async()=>{native.uploadStatus=200;native.prepareFails=false;events.length=0;await clearAuthSession();measurementHost.invalidate();await storeAuthSession({accessToken:"test",refreshToken:"test",user:{id:visitId,email:null,phone:null,displayName:null,role:"buyer"}});server.use(http.post("*/api/v1/measurement/bootstrap",()=>HttpResponse.json({visitId,generation:"synthetic-generation",purposes:["product_reliability"]})),http.post("*/api/v1/measurement/events",async({request})=>{events.push(...(await request.json() as {events:MeasurementSchemas.MeasurementEvent[]}).events);return new HttpResponse(null,{status:204});}),http.post("*/api/v1/uploads/presign",()=>HttpResponse.json({uploadUrl:"https://synthetic.test/private-signed-url",key:"pending/private-key.webp",expiresIn:300,maxSizeBytes:5000000})));await measurementHost.foreground();});
it.each(["success","preparation_failure","upload_failure"])("records actual photo %s without local paths, keys or upload URLs",async(scenario)=>{
 native.prepareFails=scenario==="preparation_failure";native.uploadStatus=scenario==="upload_failure"?503:200;
 const view=await renderMobile(<Probe/>);await waitFor(()=>expect(view.getByRole("button",{name:"Pick"}).props.accessibilityState?.disabled).not.toBe(true));await act(async()=>{fireEvent.press(view.getByRole("button",{name:"Pick"}));});await waitFor(()=>expect(view.getByText(scenario==="success"?"uploaded":"failed")).toBeTruthy());await measurementHost.queue.flush();
 expect(events.filter(event=>event.eventName==="media_preparation_result").map(event=>event.payload)).toEqual([expect.objectContaining({kind:"photo",result:scenario==="preparation_failure"?"technical_failure":"success"})]);expect(events.filter(event=>event.eventName==="media_upload_result").map(event=>event.payload)).toEqual(scenario==="preparation_failure"?[]:[expect.objectContaining({kind:"photo",result:scenario==="upload_failure"?"technical_failure":"success"})]);expect(JSON.stringify(events)).not.toContain("private");
});
