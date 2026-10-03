import { describe, it, expect, vi, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import type { ListingsSchemas } from "@auto-tm/contracts";
import { waitFor } from "@testing-library/react-native";

import { act, fireEvent, renderMobile, routeParams, routerMock } from "../render";
import { server } from "../msw";
import EditListingScreen from "../../app/listings/[id]/edit";

// The edit route with its real save orchestration against an in-memory API:
// a background refetch lands between a partial save failure and Retry.

const fixture = vi.hoisted(() => {
  const id = "550e8400-e29b-41d4-a716-446655440000";
  const persistedId = "550e8400-e29b-41d4-a716-446655440001";
  const localId = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
  const variants = { thumbnail: "t.jpg", list: "l.jpg", detail: "d.jpg", fullscreen: "f.jpg" };
  return {
    id, persistedId, localId, variants,
    persistedKey: `listings/${id}/${persistedId}/original.jpg`,
    newKey: "pending/9f1c/original.jpg",
    listing: undefined as unknown as Record<string, unknown>,
    photos: [] as unknown[],
    show: vi.fn(),
  };
});

vi.mock("../../src/auth/session", () => ({
  loadAuthSession: vi.fn(() => Promise.resolve({
    accessToken: "token-123", refreshToken: "refresh-123",
    user: { id: "u1", phone: "+99361000000", displayName: null, role: "seller" },
    storedAt: new Date().toISOString(),
  })),
  storeAuthSession: vi.fn(() => Promise.resolve()),
  clearAuthSession: vi.fn(() => Promise.resolve()),
}));
vi.mock("../../src/api/listings/useListingDetail", () => ({ useListingDetail: () => ({ data: fixture.listing }) }));
vi.mock("../../src/listings/uploadStaging/useUploadQueue", () => ({ useUploadQueue: () => ({
  photos: fixture.photos, publishGate: { canPublish: true, blockers: [] },
}) }));
vi.mock("../../src/listings/uploadStaging/stagingDir", () => ({ deleteDraftDir: vi.fn().mockResolvedValue(undefined) }));
vi.mock("lucide-react-native", async () => {
  const Icon = (await import("react-native")).View;
  return { Check: Icon, AlertCircle: Icon, Eye: Icon, ListChecks: Icon, X: Icon, ChevronLeft: Icon, RefreshCw: Icon, Pencil: Icon };
});
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ show: fixture.show }) }));
vi.mock("react-native-safe-area-context", async () => ({
  SafeAreaView: (await import("react-native")).View,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock("@/components/ui/progress", async () => ({ Progress: (await import("react-native")).View }));
vi.mock("../../src/listings/wizard/Step2Photos", () => ({ default: () => null }));
vi.mock("../../src/listings/wizard/Step3VehicleId", () => ({ default: () => null }));
vi.mock("../../src/listings/wizard/Step5Price", () => ({ default: () => null }));
vi.mock("../../src/listings/wizard/Step6Location", () => ({ default: () => null }));
vi.mock("../../src/listings/wizard/Step7DescContact", () => ({ default: () => null }));
vi.mock("../../src/api/catalog/useBrands", () => ({ useBrands: () => ({ data: { items: [] } }) }));
vi.mock("../../src/api/catalog/useModels", () => ({ useModels: () => ({ data: { items: [] } }) }));
vi.mock("../../src/api/catalog/useColors", () => ({ useColors: () => ({ data: { items: [] } }) }));
vi.mock("../../src/api/catalog/useBodyTypes", () => ({ useBodyTypes: () => ({ data: { items: [] } }) }));
vi.mock("../../src/api/catalog/useTransmissions", () => ({ useTransmissions: () => ({ data: { items: [] } }) }));
vi.mock("../../src/api/catalog/useDriveTypes", () => ({ useDriveTypes: () => ({ data: { items: [] } }) }));
vi.mock("../../src/api/catalog/useEngineTypes", () => ({ useEngineTypes: () => ({ data: { items: [] } }) }));
vi.mock("../../src/api/catalog/useRegions", () => ({ useRegions: () => ({ data: { items: [] } }) }));
vi.mock("../../src/api/catalog/useCities", () => ({ useCities: () => ({ data: { items: [] } }) }));

type Media = ListingsSchemas.ListingMedia;

/** Server-side Listing with the media and field contract the save relies on. */
function createListingApi() {
  const fields: Record<string, unknown> = {
    sellerId: fixture.id, publicNumber: 458, status: "active", brandId: fixture.id, modelId: fixture.id,
    year: 2020, condition: "used", mileageKm: 10000, priceAmount: 100000, priceCurrency: "TMT",
    displayPriceTmt: 100000, description: "Legacy listing", regionId: fixture.id, cityId: fixture.id,
    contactPhone: "+99361234567", allowCalls: true, allowChat: true, acceptsExchange: false, installmentAvailable: false,
    viewCount: 0, favoriteCount: 0, publishedAt: "2026-09-30T00:00:00.000Z",
    createdAt: "2026-09-30T00:00:00.000Z", updatedAt: "2026-09-30T00:00:00.000Z",
    seller: { displayName: "Seller", memberSince: "2026-01-01T00:00:00.000Z" },
  };
  const rows = new Map<string, Media>([[fixture.persistedId, {
    id: fixture.persistedId, kind: "image", key: fixture.persistedKey, variants: fixture.variants, sortOrder: 0,
  }]]);
  const requests = { edit: [] as Record<string, unknown>[], attach: [] as string[], remove: [] as string[], reorder: 0 };
  const failures = { reorder: 0 };
  const media = () => [...rows.values()].sort((a, b) => a.sortOrder - b.sortOrder);
  const detail = () => ({ id: fixture.id, ...fields, media: media() });

  server.use(
    http.patch("*/listings/:id", async ({ request }) => {
      const patch = (await request.json()) as Record<string, unknown>;
      requests.edit.push(patch);
      Object.assign(fields, patch);
      return HttpResponse.json(detail());
    }),
    http.post("*/listings/:id/media/attach", async ({ request }) => {
      const body = (await request.json()) as ListingsSchemas.AttachMediaRequest;
      requests.attach.push(body.key);
      const id = crypto.randomUUID();
      rows.set(id, { id, kind: "image", key: body.key, variants: fixture.variants, sortOrder: body.sortOrder });
      return HttpResponse.json({
        id, listingId: fixture.id, kind: body.kind, key: body.key, sortOrder: body.sortOrder,
        createdAt: "2026-10-02T12:00:00.000Z",
      });
    }),
    http.delete("*/listings/:id/media/:mediaId", ({ params }) => {
      requests.remove.push(String(params.mediaId));
      rows.delete(String(params.mediaId));
      return HttpResponse.json({ success: true });
    }),
    http.put("*/listings/:id/media/order", async ({ request }) => {
      requests.reorder += 1;
      if (failures.reorder > 0) {
        failures.reorder -= 1;
        return HttpResponse.json({ message: "temporarily unavailable" }, { status: 503 });
      }
      const body = (await request.json()) as ListingsSchemas.ReorderMediaRequest;
      if (body.ordering.some((o) => !rows.has(o.mediaId))) {
        return HttpResponse.json({ message: "Media not found" }, { status: 404 });
      }
      for (const o of body.ordering) {
        const row = rows.get(o.mediaId);
        if (row) row.sortOrder = o.sortOrder;
      }
      return HttpResponse.json({ success: true });
    }),
  );
  return { requests, failures, fields, media, detail };
}

beforeEach(() => {
  routeParams.id = fixture.id;
  routerMock.replace.mockClear();
  fixture.show.mockClear();
});

describe("Listing edit save across a background refetch", () => {
  it("keeps the recovery state and a post-failure edit, and Retry reaches the intended server state", async () => {
    const api = createListingApi();
    api.failures.reorder = 1;
    fixture.listing = api.detail();
    // The seller added a photo and made it the cover.
    fixture.photos = [
      { photoId: fixture.localId, key: fixture.newKey, state: "uploaded", sortOrder: 0, retryCount: 0 },
      { photoId: fixture.persistedId, key: fixture.persistedKey, state: "attached", sortOrder: 1, retryCount: 0 },
    ];

    const screen = renderMobile(<EditListingScreen />);
    fireEvent.press(screen.getByRole("radio", { name: "Damaged / needs repair: Yes" }));
    fireEvent.press(screen.getByRole("button", { name: "Done", disabled: false }));
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Save changes", disabled: false })));
    await waitFor(() => expect(screen.getByText("✗ Update photo order")).toBeTruthy());
    expect(screen.getByText("✓ Attach photo")).toBeTruthy();

    // The save's invalidations refetch the Listing: a new object with the attached row.
    fixture.listing = { ...api.detail(), favoriteCount: 1 };
    screen.rerender(<EditListingScreen />);
    expect(screen.getByText("✗ Update photo order")).toBeTruthy();
    expect(screen.getByText("Damaged / needs repair: Yes")).toBeTruthy();

    // The seller changes their answer after the failure, then another refetch lands.
    fireEvent.press(screen.getByRole("button", { name: "Edit Details and condition" }));
    fireEvent.press(screen.getByRole("radio", { name: "Damaged / needs repair: No" }));
    fixture.listing = { ...api.detail(), favoriteCount: 2 };
    screen.rerender(<EditListingScreen />);
    expect(screen.getByRole("radio", { name: "Damaged / needs repair: No", checked: true })).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Done", disabled: false }));

    const [retry] = screen.getAllByRole("button", { name: "Retry" }).slice(-1);
    if (!retry) throw new Error("No Retry button");
    await act(async () => fireEvent.press(retry));
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith(`/(public)/listings/${fixture.id}`));

    expect(api.fields.conditionDisclosure).toEqual(expect.objectContaining({ damaged: false }));
    expect(api.requests.attach).toEqual([fixture.newKey]);
    expect(api.requests.remove).toEqual([]);
    expect(api.media().map((m) => m.key)).toEqual([fixture.newKey, fixture.persistedKey]);
    expect(fixture.show).toHaveBeenCalledWith(expect.objectContaining({ variant: "success" }));
  });
});
