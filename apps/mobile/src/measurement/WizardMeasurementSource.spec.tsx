import { beforeEach,expect,it,vi } from "vitest";
import { http,HttpResponse } from "msw";
import { waitFor } from "@testing-library/react-native";
import type { MeasurementSchemas } from "@auto-tm/contracts";

import { server } from "../../test/msw";
import { act,fireEvent,renderMobile } from "../../test/render";
import SellScreen from "../../app/(tabs)/sell";
import { ToastProvider } from "@/components/ui/toast";
import { storeAuthSession,clearAuthSession } from "../auth/session";

import { measurementHost } from "./nativeMeasurement";
vi.mock("expo-secure-store",()=>{const values=new Map<string,string>();return {getItemAsync:async(key:string)=>values.get(key)??null,setItemAsync:async(key:string,value:string)=>{values.set(key,value);},deleteItemAsync:async(key:string)=>{values.delete(key);}};});
vi.mock("expo-file-system/legacy",()=>({getInfoAsync:async()=>({exists:false}),readDirectoryAsync:async()=>[],makeDirectoryAsync:async()=>undefined,deleteAsync:async()=>undefined,documentDirectory:"file:///doc/"}));
vi.mock("expo-image-manipulator",()=>({SaveFormat:{JPEG:"jpeg"},ImageManipulator:{manipulate:()=>undefined}}));
vi.mock("@react-native-community/netinfo",()=>({default:{addEventListener:()=>()=>undefined,fetch:async()=>({isConnected:true})}}));
vi.mock("@rn-primitives/progress",async()=>({Root:(await import("react-native")).View,Indicator:(await import("react-native")).View}));
vi.mock("@rn-primitives/dialog",async()=>{const React=await import("react"),native=await import("react-native");return {Root:({open,children}:{open?:boolean;children:React.ReactNode})=>open?children:null,Trigger:native.Pressable,Portal:React.Fragment,Overlay:native.View,Content:native.View,Close:native.Pressable,Title:native.Text,Description:native.Text};});
vi.mock("@rn-primitives/alert-dialog",async()=>{const React=await import("react"),native=await import("react-native");return {Root:({open,children}:{open?:boolean;children:React.ReactNode})=>open?children:null,Trigger:native.Pressable,Portal:React.Fragment,Overlay:native.View,Content:native.View,Cancel:native.Pressable,Action:native.Pressable,Title:native.Text,Description:native.Text};});
vi.mock("@rn-primitives/checkbox",async()=>({Root:(await import("react-native")).Pressable,Indicator:(await import("react-native")).View}));
vi.mock("react-native-screens",async()=>({FullWindowOverlay:(await import("react")).Fragment}));
vi.mock("@rn-primitives/switch",async()=>({Root:(await import("react-native")).Pressable,Thumb:(await import("react-native")).View}));
vi.mock("expo-image-picker",()=>({}));
vi.mock("@react-navigation/native",async()=>({NavigationContext:(await import("react")).createContext(undefined)}));
vi.mock("react-native-safe-area-context",async()=>({SafeAreaView:(await import("react-native")).View,useSafeAreaInsets:()=>({top:0,right:0,bottom:0,left:0})}));
vi.hoisted(()=>{process.env["EXPO_PUBLIC_MEASUREMENT_ENABLED"]="true";});
const events:MeasurementSchemas.MeasurementEvent[]=[],draftId="00000000-0000-4000-8000-000000000701",visitId="00000000-0000-4000-8000-000000000501";
beforeEach(async()=>{events.length=0;await clearAuthSession();measurementHost.invalidate();server.use(http.post("*/api/v1/measurement/bootstrap",()=>HttpResponse.json({visitId,generation:"synthetic-generation",purposes:["product_improvement"],guestCapability:`mg_${"a".repeat(43)}`})),http.post("*/api/v1/measurement/events",async({request})=>{events.push(...(await request.json() as {events:MeasurementSchemas.MeasurementEvent[]}).events);return new HttpResponse(null,{status:204});}));await measurementHost.foreground();});

it("opens the actual resumed wizard vehicle step without copying draft content",async()=>{
 await storeAuthSession({accessToken:"test",refreshToken:"test",user:{id:visitId,email:null,phone:null,displayName:null,role:"buyer"}});
 server.use(http.patch("*/api/v1/listings/drafts/*",async({request})=>HttpResponse.json({id:draftId,userId:visitId,payload:await request.json(),createdAt:"2026-10-18T00:00:00Z",updatedAt:"2026-10-18T00:00:00Z"})),http.get("*/api/v1/*",({request})=>{
  const path=new URL(request.url).pathname;
  if(path.endsWith("/me/drafts"))return HttpResponse.json({items:[{id:draftId,userId:visitId,payload:{description:"private seller text"},createdAt:"2026-10-18T00:00:00Z",updatedAt:"2026-10-18T00:00:00Z"}],nextCursor:null});
  return HttpResponse.json({items:[],workspace:null});
 }));
 const view=await renderMobile(<ToastProvider><SellScreen/></ToastProvider>);
 await waitFor(()=>expect(view.getByText("Continue")).toBeTruthy());
 await act(async()=>{fireEvent.press(view.getByText("Continue"));});
 await waitFor(async()=>{await measurementHost.queue.flush();expect(events.some(event=>event.eventName==="wizard_step_opened"&&event.payload.step==="vehicle"&&event.payload.draftId===draftId)).toBe(true);});
});
