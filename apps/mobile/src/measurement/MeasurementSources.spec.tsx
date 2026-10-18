import { beforeEach,describe,expect,it,vi } from "vitest";
import { http,HttpResponse } from "msw";
import { waitFor } from "@testing-library/react-native";
import type { MeasurementSchemas } from "@auto-tm/contracts";

import { server } from "../../test/msw";
import { act,renderMobile,routeParams } from "../../test/render";
import { fixture } from "../../test/fixtures/listing";
import HomeScreen from "../../app/(tabs)/(search)/index";
import ResultsScreen from "../../app/(tabs)/(search)/results";
import ListingDetailScreen from "../../app/(public)/listings/[id]";
import { SearchScreen } from "../listings/search/SearchScreen";

import { measurementHost } from "./nativeMeasurement";
vi.hoisted(()=>{process.env["EXPO_PUBLIC_MEASUREMENT_ENABLED"]="true";});
vi.mock("@react-navigation/native",async()=>({DefaultTheme:{dark:false,colors:{}},DarkTheme:{dark:true,colors:{}},NavigationContext:(await import("react")).createContext(undefined),useScrollToTop:()=>undefined}));
vi.mock("react-native-safe-area-context",async()=>({SafeAreaView:(await import("react-native")).View,useSafeAreaInsets:()=>({top:0,right:0,bottom:0,left:0})}));
const events:MeasurementSchemas.MeasurementEvent[]=[],visitId="00000000-0000-4000-8000-000000000501";
beforeEach(async()=>{
 events.length=0;measurementHost.invalidate();
 server.use(http.post("*/api/v1/measurement/bootstrap",()=>HttpResponse.json({visitId,generation:"synthetic-generation",purposes:["product_improvement","product_reliability"],guestCapability:`mg_${"a".repeat(43)}`})),
  http.post("*/api/v1/measurement/events",async({request})=>{events.push(...(await request.json() as {events:MeasurementSchemas.MeasurementEvent[]}).events);return new HttpResponse(null,{status:204});}),
  http.get("*/api/v1/*",({request})=>{
   const path=new URL(request.url).pathname;
   if(path.endsWith("/config"))return HttpResponse.json({signupsEnabled:true,inspectionInterestEnabled:false,reportEntryEnabled:true});
   if(path.endsWith("/listings/count"))return HttpResponse.json({totalMatching:0});
   if(path.endsWith("/listings/filter-options/brands"))return HttpResponse.json({items:[]});
   if(path.endsWith("/listings"))return HttpResponse.json({items:[],nextCursor:null});
   if(path.includes("/listings/"))return HttpResponse.json(fixture());
   return HttpResponse.json({items:[],results:[],nextCursor:null,hasMore:false});
  }));
 await measurementHost.foreground();
});
describe("actual native discovery and detail source facts",()=>{
 it.each([["home",HomeScreen],["search",SearchScreen],["results",ResultsScreen]] as const)("emits %s open and immutable visit without private input",async(screen,Component)=>{
  await renderMobile(<Component/>);
  await waitFor(async()=>{await act(async()=>{await measurementHost.queue.flush();});expect(events.some(event=>event.eventName==="discovery_opened"&&event.payload.screen===screen)).toBe(true);});
  expect(events.some(event=>event.eventName==="visit_started"&&event.eventId===visitId)).toBe(true);
  expect(JSON.stringify(events)).not.toContain("Bearer");
 });
 it("emits completed zero-result search once while a cached result re-renders",async()=>{
  const view=await renderMobile(<ResultsScreen/>);
  await waitFor(async()=>{await act(async()=>{await measurementHost.queue.flush();});expect(events.filter(event=>event.eventName==="search_completed")).toHaveLength(1);});
  await view.rerender(<ResultsScreen/>);await act(async()=>{await measurementHost.queue.flush();});
  expect(events.filter(event=>event.eventName==="search_completed")).toHaveLength(1);
  expect(events.find(event=>event.eventName==="search_completed")?.payload).toEqual({resultCount:"zero",filters:{}});
 });
 it("emits the actual successfully loaded Listing detail ID",async()=>{
  routeParams.id=fixture().id;await renderMobile(<ListingDetailScreen/>);
  await waitFor(async()=>{await act(async()=>{await measurementHost.queue.flush();});expect(events.find(event=>event.eventName==="listing_detail_opened")?.payload).toEqual({listingId:fixture().id});});
 });
});
