import { beforeEach,expect,it,vi } from "vitest";
import { http,HttpResponse } from "msw";

import ResultsScreen from "../../app/(tabs)/(search)/results";
import { server } from "../../test/msw";
import { renderMobile,fireEvent,routerMock } from "../../test/render";
import { fixture,summaryFixture,maps } from "../../test/fixtures/listing";
import { ListingDetailView } from "../listings/components/ListingDetail";

vi.mock("@react-navigation/native",async()=>({DefaultTheme:{dark:false,colors:{}},DarkTheme:{dark:true,colors:{}},NavigationContext:(await import("react")).createContext(undefined),useScrollToTop:()=>undefined}));
vi.mock("react-native-safe-area-context",async()=>({SafeAreaView:(await import("react-native")).View,useSafeAreaInsets:()=>({top:0,right:0,bottom:0,left:0})}));
const id=fixture().id,reference="00000000-0000-4000-8000-000000000501";
beforeEach(()=>{
 server.use(http.get("*/api/v1/public-diagnostics/listings",()=>HttpResponse.json([{listingId:id,reportId:reference,observedAt:"2026-10-17T10:00:00.000Z",mileageKm:123000,synthetic:true}])),http.get("*/api/v1/*",({request})=>{
  const path=new URL(request.url).pathname;
  if(path.endsWith("/config"))return HttpResponse.json({signupsEnabled:true,inspectionInterestEnabled:false,reportEntryEnabled:true});
  if(path.endsWith("/listings/count"))return HttpResponse.json({totalMatching:1,priceMinTmt:35000,priceMaxTmt:35000});
  if(path.endsWith("/listings/filter-options/brands"))return HttpResponse.json({items:[]});
  if(path.endsWith("/listings"))return HttpResponse.json({items:[summaryFixture({brandId:reference,modelId:reference,cityId:reference,transmissionId:reference,engineTypeId:reference})],nextCursor:null});
  return HttpResponse.json({items:[],results:[],nextCursor:null,hasMore:false});
 }));
});
it("opens the public report from the actual Results card through its dedicated projection",async()=>{const view=await renderMobile(<ResultsScreen/>);await fireEvent.press(await view.findByRole("button",{name:"Inspection report available"}));expect(routerMock.push).toHaveBeenCalledWith({pathname:"/diagnostics/[id]",params:{id:reference,audience:"public"}});});
it("opens the same public report from actual Listing detail without treating seller ownership as private authority",async()=>{const view=await renderMobile(<ListingDetailView listing={fixture()} maps={maps} isOwner/>);await fireEvent.press(await view.findByRole("button",{name:"Inspection report available"}));expect(routerMock.push).toHaveBeenCalledWith({pathname:"/diagnostics/[id]",params:{id:reference,audience:"public"}});});
