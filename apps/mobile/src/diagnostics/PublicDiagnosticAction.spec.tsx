import { waitFor } from "@testing-library/react-native";
import { beforeEach, expect, it } from "vitest";
import { http, HttpResponse } from "msw";

import { renderMobile,fireEvent,routerMock,act } from "../../test/render";
import { server } from "../../test/msw";

import { PublicDiagnosticAction } from "./PublicDiagnosticAction";
const listingId="11111111-1111-4111-8111-111111111111",reportId="22222222-2222-4222-8222-222222222222";
let available=true;
beforeEach(()=>{available=true;server.use(http.get("*/public-diagnostics/listings",({request})=>{expect(request.headers.get("Authorization")).toBeNull();expect(new URL(request.url).searchParams.get("ids")).toBe(listingId);return HttpResponse.json(available?[{listingId,reportId,observedAt:"2026-10-17T10:00:00.000Z",mileageKm:123000,synthetic:true}]:[]);}));});
it.each([["en","Inspection report available"],["ru","Доступен отчёт об осмотре"],["tk","Barlag hasabaty elýeterli"]])("opens complete public findings from the neutral action in %s",async(locale,label)=>{const view=await renderMobile(<PublicDiagnosticAction listingId={listingId}/>,{locale});await fireEvent.press(await view.findByRole("button",{name:label}));expect(routerMock.push).toHaveBeenCalledWith({pathname:"/diagnostics/[id]",params:{id:reportId,audience:"public"}});});
it("removes an unavailable public association after revalidation without exposing a private indicator",async()=>{const view=await renderMobile(<PublicDiagnosticAction listingId={listingId}/>);await view.findByRole("button",{name:"Inspection report available"});available=false;await act(async()=>{await view.queryClient.invalidateQueries({queryKey:["diagnostics","availability"]});});await waitFor(()=>expect(view.queryByRole("button",{name:"Inspection report available"})).toBeNull());expect(view.queryByText(/private report/i)).toBeNull();});
