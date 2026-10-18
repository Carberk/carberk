import { http, HttpResponse } from "msw";
import { setupServer } from "msw/native";

export const server = setupServer(http.get("http://localhost:3006/api/v1/listing-video/capabilities", () => HttpResponse.json({ canUpload: false, canView: false })));
